"""
AETHER — ST-GCN Spatio-Temporal Graph Convolutional Network Model
Provides graph construction from station coordinates and wind alignment.
Falls back gracefully when torch or torch_geometric is not installed.
"""
from __future__ import annotations
import logging
import numpy as np

logger = logging.getLogger(__name__)

# Try to import torch and torch_geometric
try:
    import torch
    import torch.nn as nn
    from torch_geometric.nn import GCNConv
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False
    torch = None
    class nn:
        class Module: pass
    logger.warning("torch or torch-geometric not available. STGCN models will stub out.")

class STGCNBlock(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3):
        if not TORCH_AVAILABLE:
            return
        super().__init__()
        self.temporal_conv = nn.Conv2d(in_channels, out_channels, 
                                       (kernel_size, 1), 
                                       padding=(kernel_size//2, 0))
        self.spatial_conv = GCNConv(out_channels, out_channels)
        self.bn = nn.BatchNorm2d(out_channels)
        
    def forward(self, x, edge_index, edge_weight):
        # x shape: (batch, nodes, features, timesteps)
        if not TORCH_AVAILABLE:
            return x
        x = self.temporal_conv(x)
        x = self.spatial_conv(x, edge_index, edge_weight)
        return torch.relu(self.bn(x))

class AetherSTGCN(nn.Module):
    def __init__(self, num_nodes, num_features, num_timesteps_input=24, num_timesteps_output=72):
        if not TORCH_AVAILABLE:
            return
        super().__init__()
        self.st_blocks = nn.ModuleList([
            STGCNBlock(num_features, 64),
            STGCNBlock(64, 64),
            STGCNBlock(64, 32)
        ])
        self.fc = nn.Linear(32 * num_timesteps_input, num_timesteps_output)
        
    def forward(self, x, edge_index, edge_weight):
        if not TORCH_AVAILABLE:
            return x
        for block in self.st_blocks:
            x = block(x, edge_index, edge_weight)
        return self.fc(x.reshape(x.size(0), -1))

def build_wind_aligned_graph(stations_df, wind_direction_deg, aqi_history_matrix, 
                             distance_threshold_km=15, correlation_threshold=0.6):
    """
    stations_df: DataFrame with columns [station_id, lat, lon, ward_id]
    wind_direction_deg: current wind direction (0=North, 90=East)
    aqi_history_matrix: (n_stations, n_timesteps) historical AQI values
    """
    n = len(stations_df)
    coords = stations_df[['lat', 'lon']].values
    
    # Haversine distance matrix
    dist_matrix = haversine_distance_matrix(coords)
    
    # Pearson correlation matrix
    if aqi_history_matrix is not None and aqi_history_matrix.shape[1] > 1:
        corr_matrix = np.corrcoef(aqi_history_matrix)
    else:
        corr_matrix = np.eye(n)
    
    # Wind vector
    wind_rad = np.radians(wind_direction_deg)
    wind_vec = np.array([np.sin(wind_rad), np.cos(wind_rad)])
    
    edges = []
    edge_weights = []
    
    for i in range(n):
        for j in range(i+1, n):
            if dist_matrix[i, j] > distance_threshold_km:
                continue
            if corr_matrix[i, j] < correlation_threshold:
                continue
            
            # Wind alignment: dot product of station-to-station vector with wind
            dx = coords[j, 1] - coords[i, 1]  # lon diff
            dy = coords[j, 0] - coords[i, 0]   # lat diff
            station_vec = np.array([dx, dy])
            station_vec = station_vec / (np.linalg.norm(station_vec) + 1e-8)
            
            alignment = np.dot(station_vec, wind_vec)
            # Higher weight if downwind (alignment > 0), lower if upwind
            weight = dist_matrix[i, j] / max(alignment + 0.5, 0.1)
            
            edges.extend([[i, j], [j, i]])
            edge_weights.extend([weight, weight])
            
    if not edges:
        # Guarantee at least self-loops if no edges pass thresholds
        for i in range(n):
            edges.extend([[i, i]])
            edge_weights.extend([1.0])
    
    if TORCH_AVAILABLE:
        edge_index = torch.tensor(edges, dtype=torch.long).t()
        edge_weight = torch.tensor(edge_weights, dtype=torch.float)
    else:
        edge_index = np.array(edges).T
        edge_weight = np.array(edge_weights)
        
    return edge_index, edge_weight

def haversine_distance_matrix(coords):
    """Compute haversine distance matrix in km"""
    try:
        from sklearn.metrics.pairwise import haversine_distances
        coords_rad = np.radians(coords)
        return haversine_distances(coords_rad) * 6371  # Earth radius in km
    except ImportError:
        # Fallback haversine distance using basic numpy
        n = len(coords)
        dist = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                lat1, lon1 = np.radians(coords[i, 0]), np.radians(coords[i, 1])
                lat2, lon2 = np.radians(coords[j, 0]), np.radians(coords[j, 1])
                dlat = lat2 - lat1
                dlon = lon2 - lon1
                a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
                c = 2 * np.arcsin(np.sqrt(a))
                dist[i, j] = 6371 * c
        return dist
