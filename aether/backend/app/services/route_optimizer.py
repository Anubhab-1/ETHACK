"""
AETHER — Vehicle Routing & Inspector Route Optimization
Uses Google OR-Tools to solve the VRP (Vehicle Routing Problem) with priorities.
Fully functional in offline mode, with Haversine distance matrix computation.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

logger = logging.getLogger(__name__)

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometers."""
    R = 6371.0  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_distance_matrix(locations: List[Dict[str, Any]]) -> List[List[int]]:
    """
    Computes distance matrix in meters.
    Multiplies straight-line Haversine distance by a routing factor (1.3) to simulate roads.
    """
    n = len(locations)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i][j] = 0
            else:
                dist_km = haversine_distance(
                    locations[i]["lat"], locations[i]["lon"],
                    locations[j]["lat"], locations[j]["lon"]
                )
                # Convert to meters and apply road circuity factor
                matrix[i][j] = int(dist_km * 1.3 * 1000)
    return matrix

def optimize_inspector_routes(
    locations: List[Dict[str, Any]],
    n_inspectors: int = 3,
    time_budget_hours: float = 8.0,
    average_speed_kmh: float = 30.0
) -> Dict[str, Any]:
    """
    Optimizes inspector routes from a central depot (assumed to be index 0).
    Uses OR-Tools routing engine.
    """
    if not locations:
        return {"routes": [], "total_distance_meters": 0, "status": "No locations provided"}

    # Central office / Depot is always locations[0]
    depot_index = 0
    num_locations = len(locations)

    if num_locations <= 1:
        return {
            "routes": [{"inspector_id": i, "route": []} for i in range(n_inspectors)],
            "total_distance_meters": 0,
            "status": "No sites to visit"
        }

    # Prepare distance matrix
    distance_matrix = calculate_distance_matrix(locations)

    # Speed in meters per minute
    speed_mpm = (average_speed_kmh * 1000) / 60.0
    time_budget_mins = int(time_budget_hours * 60)

    # Create routing model
    manager = pywrapcp.RoutingIndexManager(num_locations, n_inspectors, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    # 1. Create distance callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)

    # Define cost of each link (distance)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # 2. Add time / distance dimension to restrict maximum travel budget
    # 1 meter of distance is assumed to take 1 / speed_mpm minutes.
    # Plus a 20-minute inspection duration at each site (except depot)
    def travel_time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel_dist = distance_matrix[from_node][to_node]
        travel_time = int(travel_dist / speed_mpm)
        service_time = 20 if from_node != depot_index else 0
        return travel_time + service_time

    time_callback_index = routing.RegisterTransitCallback(travel_time_callback)
    routing.AddDimension(
        time_callback_index,
        0,  # no slack
        time_budget_mins,  # max time per vehicle
        True,  # start cumul to zero
        "Time"
    )

    # 3. Formulate search parameters
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.FromSeconds(2)

    # Solve the problem
    solution = routing.SolveWithParameters(search_parameters)

    routes_out = []
    total_dist = 0
    total_time = 0

    if solution:
        for vehicle_id in range(n_inspectors):
            index = routing.Start(vehicle_id)
            route = []
            vehicle_dist = 0

            while not routing.IsEnd(index):
                node_idx = manager.IndexToNode(index)
                if node_idx != depot_index:
                    route.append({
                        "node_index": node_idx,
                        "site_id": locations[node_idx].get("id"),
                        "name": locations[node_idx].get("name", f"Site #{node_idx}"),
                        "lat": locations[node_idx]["lat"],
                        "lon": locations[node_idx]["lon"],
                        "priority": locations[node_idx].get("priority", 0)
                    })
                previous_index = index
                index = solution.Value(routing.NextVar(index))
                vehicle_dist += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)

            total_dist += vehicle_dist
            # Travel time + service time
            travel_time_mins = int(vehicle_dist / speed_mpm)
            service_time_mins = len(route) * 20
            route_duration_mins = travel_time_mins + service_time_mins
            total_time += route_duration_mins

            routes_out.append({
                "inspector_id": vehicle_id + 1,
                "stops": route,
                "stop_count": len(route),
                "distance_km": round(vehicle_dist / 1000.0, 2),
                "estimated_duration_mins": route_duration_mins
            })

        status = "SUCCESS"
    else:
        status = "FAILED"

    return {
        "routes": routes_out,
        "total_distance_km": round(total_dist / 1000.0, 2),
        "total_duration_mins": total_time,
        "inspector_count": n_inspectors,
        "status": status
    }
