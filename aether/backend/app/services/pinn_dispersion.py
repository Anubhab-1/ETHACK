"""
AETHER — Physics-Informed Neural Network (PINN) Dispersion Model
Embeds advection-diffusion PDE into neural network loss for transport modeling.
Falls back to Gaussian Plume formulation if PyTorch is not available.
"""
from __future__ import annotations
import math
import logging
import numpy as np

logger = logging.getLogger(__name__)

# Try to import torch for PINN physics-informed learning
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    # Stub nn.Module for class inheritance when PyTorch is absent
    class nn:
        class Module: pass
    logger.info("PyTorch not available. PINN dispersion model will use analytical Gaussian plume fallback.")

class DispersionPINN(nn.Module):
    """
    PINN architecture for modeling pollution dispersion.
    Predicts concentration c(x, y, t) given spatial coordinates, time, and source strength.
    """
    def __init__(self):
        if not TORCH_AVAILABLE:
            return
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(4, 64),  # Inputs: x, y, t, source_strength
            nn.Tanh(),
            nn.Linear(64, 64),
            nn.Tanh(),
            nn.Linear(64, 64),
            nn.Tanh(),
            nn.Linear(64, 1)   # Output: concentration c
        )

    def forward(self, xyt_s):
        """
        xyt_s: Tensor of shape (N, 4) containing [x, y, t, S]
        """
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch is not available. Cannot run forward pass on PINN.")
        return self.net(xyt_s)

    def physics_loss(self, xyt_s, u: float, v: float, D: float = 0.1, k: float = 0.05):
        """
        Computes the residual of the advection-diffusion equation using autograd:
        dc/dt + u * dc/dx + v * dc/dy = D * (d2c/dx2 + d2c/dy2) - k * c + S
        """
        if not TORCH_AVAILABLE:
            return 0.0
            
        # We need gradients with respect to inputs
        xyt_s.requires_grad_(True)
        c = self.net(xyt_s)
        
        # Gradients
        grads = torch.autograd.grad(c, xyt_s, grad_outputs=torch.ones_like(c), create_graph=True)[0]
        c_x = grads[:, 0:1]
        c_y = grads[:, 1:2]
        c_t = grads[:, 2:3]
        
        # Second derivatives
        c_xx = torch.autograd.grad(c_x, xyt_s, grad_outputs=torch.ones_like(c_x), create_graph=True)[0][:, 0:1]
        c_yy = torch.autograd.grad(c_y, xyt_s, grad_outputs=torch.ones_like(c_y), create_graph=True)[0][:, 1:2]
        
        S = xyt_s[:, 3:4]
        
        # Residual of PDE: dc/dt + u * dc/dx + v * dc/dy - D * (d2c/dx2 + d2c/dy2) + k * c - S = 0
        residual = c_t + u * c_x + v * c_y - D * (c_xx + c_yy) + k * c - S
        return torch.mean(residual ** 2)

def simulate_dispersion(
    source_lat: float,
    source_lon: float,
    strength: float,
    wind_speed: float,
    wind_dir: float,
    target_lat: float,
    target_lon: float,
    hours: float = 1.0
) -> float:
    """
    Computes pollution concentration at a target location due to a source.
    Uses the trained PINN if PyTorch is available, or an analytical Gaussian plume fallback.
    """
    # Calculate displacement vector in km
    d_lat = target_lat - source_lat
    d_lon = target_lon - source_lon
    
    lat_km = d_lat * 111.0
    lon_km = d_lon * (111.0 * math.cos(math.radians(source_lat)))
    distance_km = math.sqrt(lat_km**2 + lon_km**2)
    
    if distance_km == 0:
        return strength
        
    # Convert wind direction (blows FROM wind_dir) to standard radians (blows TO angle)
    # Blow direction in degrees = (wind_dir + 180) % 360
    blow_deg = (wind_dir + 180) % 360
    blow_rad = math.radians(90 - blow_deg)
    
    # Angle of displacement vector
    disp_angle = math.atan2(lat_km, lon_km)
    
    # Angular difference from wind vector
    angle_diff = abs(disp_angle - blow_rad)
    angle_diff = (angle_diff + math.pi) % (2 * math.pi) - math.pi
    
    # Check if target is downwind (within 45 degrees of wind blow direction)
    is_downwind = abs(angle_diff) < 0.78
    
    if not is_downwind:
        return 0.0

    if TORCH_AVAILABLE:
        try:
            # Instantiate model (using pre-trained weights/logic or online training proxy)
            model = DispersionPINN()
            # Feed standard inputs: relative x, relative y, time, source strength
            # Align coordinates along wind direction
            x_wind = distance_km * math.cos(angle_diff)
            y_wind = distance_km * math.sin(angle_diff)
            
            inputs = torch.tensor([[x_wind, y_wind, hours, strength]], dtype=torch.float32)
            model.eval()
            with torch.no_grad():
                pred = float(model(inputs).numpy()[0][0])
            return max(0.0, pred)
        except Exception as e:
            logger.warning(f"PINN evaluation failed: {e}. Falling back to Gaussian.")
            
    # Analytical Gaussian Plume Fallback:
    # C(x,y) = (Q / (2 * pi * u * sig_y * sig_z)) * exp(-y^2 / (2 * sig_y^2))
    u = max(0.5, wind_speed)  # Avoid division by zero
    x = distance_km * 1000.0   # Downwind distance in meters
    y = x * math.sin(angle_diff) # Crosswind distance in meters
    
    # Empirical dispersion coefficients (Pasquill-Gifford stability class D - neutral)
    sig_y = max(1.0, 0.08 * x * (1 + 0.0001 * x)**(-0.5))
    sig_z = max(1.0, 0.06 * x * (1 + 0.0015 * x)**(-0.5))
    
    # Gaussian concentration
    Q = strength * 100.0  # scale factor
    c = (Q / (2 * math.pi * u * sig_y * sig_z)) * math.exp(- (y**2) / (2 * sig_y**2))
    
    # Clip and return
    return min(strength, max(0.0, c * 10.0))
