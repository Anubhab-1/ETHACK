import pytest

def test_health_check_observability(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "db_connected" in data
    assert "version" in data
    # Assert middleware injected tracing headers in response
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time-Ms" in response.headers

def test_prometheus_metrics_observability(client):
    response = client.get("/api/metrics")
    assert response.status_code == 200
    text = response.text
    # Assert health metrics structure
    assert "# HELP aether_db_query_latency_seconds" in text
    assert "# TYPE aether_db_query_latency_seconds gauge" in text
    assert "aether_db_query_latency_seconds" in text

    assert "# HELP aether_active_stations_total" in text
    assert "# TYPE aether_active_stations_total gauge" in text
    assert "aether_active_stations_total" in text

    assert "# HELP aether_citizen_reports_total" in text
    assert 'aether_citizen_reports_total{status="total"}' in text

    assert "# HELP aether_enforcement_actions_total" in text
    assert 'aether_enforcement_actions_total{status="total"}' in text

    # Assert middleware injected tracing headers in response
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time-Ms" in response.headers

def test_request_tracing_middleware(client):
    custom_trace_id = "test-client-trace-12345"
    response = client.get("/api/health", headers={"X-Request-ID": custom_trace_id})
    assert response.status_code == 200
    # The middleware should capture and echo the incoming trace ID
    assert response.headers.get("X-Request-ID") == custom_trace_id
    assert "X-Process-Time-Ms" in response.headers
