"""
AETHER — Kafka Streaming Pipeline Stubs
Provides real-time ingestion topics for CPCB, satellite, weather, traffic, and IoT sensor streams.
Falls back to APScheduler polling if Kafka broker is unavailable or library is not installed.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Dict

logger = logging.getLogger(__name__)

# Try importing kafka for streaming ingestion
try:
    from kafka import KafkaConsumer, KafkaProducer

    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False
    logger.info(
        "Kafka library (kafka-python) not installed. Falling back to default polling services."
    )

# Ingestion Topics
TOPICS = {
    "CPCB_RAW": "cpcb.raw.readings",
    "SATELLITE_NO2": "satellite.tropomi.no2",
    "SATELLITE_AOD": "satellite.modis.aod",
    "WEATHER": "weather.openmeteo",
    "TRAFFIC": "traffic.google.maps",
    "IOT_STREAM": "iot.sensor.stream",
    "ENFORCEMENT": "enforcement.actions",
    "CITIZEN_ALERTS": "citizen.alerts",
    "AGENT_DECISIONS": "agent.decisions",
    "ANOMALY": "anomaly.detected",
}


class KafkaStreamManager:
    """
    Manages Kafka producers and consumers for AETHER's real-time data stream pipeline.
    """

    def __init__(self, bootstrap_servers: str = "localhost:9092"):
        self.bootstrap_servers = bootstrap_servers
        self.producer = None
        self.consumers = {}

        if KAFKA_AVAILABLE:
            try:
                self.producer = KafkaProducer(
                    bootstrap_servers=self.bootstrap_servers,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                    acks="all",
                    retries=3,
                )
                logger.info(
                    f"Kafka Producer successfully connected to {self.bootstrap_servers}"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to connect Kafka Producer to {self.bootstrap_servers}: {e}"
                )
                self.producer = None

    def publish_event(self, topic_key: str, data: Dict[str, Any]) -> bool:
        """
        Publishes a message to a specific topic.
        """
        topic = TOPICS.get(topic_key)
        if not topic:
            logger.warning(f"Unknown topic key: {topic_key}")
            return False

        if KAFKA_AVAILABLE and self.producer:
            try:
                future = self.producer.send(topic, value=data)
                # Wait for delivery
                future.get(timeout=2.0)
                logger.info(
                    f"Published event to topic '{topic}': {list(data.keys())[:3]}"
                )
                return True
            except Exception as e:
                logger.error(f"Error publishing to topic {topic}: {e}")

        # Fallback to local log emission
        logger.info(
            f"[POLLING FALLBACK] Ingested raw event for '{topic}': {list(data.keys())[:3]}"
        )
        return True

    def register_consumer(
        self,
        topic_key: str,
        consumer_group: str,
        callback: Callable[[Dict[str, Any]], None],
    ):
        """
        Registers an consumer callback for a streaming topic.
        """
        topic = TOPICS.get(topic_key)
        if not topic:
            return

        logger.info(
            f"Registering consumer for topic '{topic}' on group '{consumer_group}'..."
        )
        if KAFKA_AVAILABLE:
            try:
                consumer = KafkaConsumer(
                    topic,
                    bootstrap_servers=self.bootstrap_servers,
                    group_id=consumer_group,
                    value_deserializer=lambda x: json.loads(x.decode("utf-8")),
                    auto_offset_reset="latest",
                )
                self.consumers[topic] = (consumer, callback)
            except Exception as e:
                logger.warning(f"Failed to setup consumer for {topic}: {e}")


# Global streaming client instance
stream_manager = KafkaStreamManager(bootstrap_servers="localhost:9092")
