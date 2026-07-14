"""
AETHER — Physics-Informed Neural Network (PINN) Dispersion Model
Embeds advection-diffusion PDE into neural network loss for transport modeling.
Falls back to Gaussian Plume formulation if PyTorch is not available.
"""
from __future__ import annotations

import logging
import math
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Try to import torch for PINN physics-informed learning
try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False
    # Stub nn.Module for class inheritance when PyTorch is absent
    class nn:
        class Module:
            pass
    logger.info("PyTorch not available or failed to import. PINN dispersion model will use analytical Gaussian plume fallback.")

class DispersionPINN(nn.Module):
    """
    PINN architecture for modeling pollution dispersion.
    Predicts concentration c(x, y, t, S, wind_speed) given coordinates, time, source strength, and wind speed.
    """
    def __init__(self):
        if not TORCH_AVAILABLE:
            return
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(5, 64),  # Inputs: x, y, t, source_strength, wind_speed
            nn.Tanh(),
            nn.Linear(64, 64),
            nn.Tanh(),
            nn.Linear(64, 64),
            nn.Tanh(),
            nn.Linear(64, 1)   # Output: concentration c
        )

    def forward(self, xyt_sw):
        """
        xyt_sw: Tensor of shape (N, 5) containing [x, y, t, S, wind_speed]
        """
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch is not available. Cannot run forward pass on PINN.")
        return self.net(xyt_sw)

    def physics_loss(self, xyt_sw, D: float = 0.15, k: float = 0.05):
        """
        Computes the residual of the advection-diffusion equation using autograd:
        dc/dt + u * dc/dx + v * dc/dy = D * (d2c/dx2 + d2c/dy2) - k * c + S
        In wind-aligned coordinates, u = wind_speed, v = 0.
        """
        if not TORCH_AVAILABLE:
            return 0.0

        # We need gradients with respect to inputs
        xyt_sw.requires_grad_(True)
        c = self.net(xyt_sw)

        # Gradients
        grads = torch.autograd.grad(c, xyt_sw, grad_outputs=torch.ones_like(c), create_graph=True)[0]
        c_x = grads[:, 0:1]
        c_y = grads[:, 1:2]
        c_t = grads[:, 2:3]

        # Second derivatives
        c_xx = torch.autograd.grad(c_x, xyt_sw, grad_outputs=torch.ones_like(c_x), create_graph=True)[0][:, 0:1]
        c_yy = torch.autograd.grad(c_y, xyt_sw, grad_outputs=torch.ones_like(c_y), create_graph=True)[0][:, 1:2]

        S = xyt_sw[:, 3:4]
        u = xyt_sw[:, 4:5]  # wind speed acts as the advection velocity along x-axis
        v = 0.0

        # Residual of PDE: dc/dt + u * dc/dx + v * dc/dy - D * (c_xx + c_yy) + k * c - S = 0
        residual = c_t + u * c_x + v * c_y - D * (c_xx + c_yy) + k * c - S
        return torch.mean(residual ** 2)

GLOBAL_PINN = None

def get_trained_pinn() -> Optional[DispersionPINN]:
    """
    Retrieves the trained PINN, initializing and running a rapid CPU training loop
    if accessed for the first time. Caches the trained model globally.
    """
    global GLOBAL_PINN
    if not TORCH_AVAILABLE:
        return None

    if GLOBAL_PINN is not None:
        return GLOBAL_PINN

    logger.info("Initializing and training Physics-Informed Neural Network (PINN) dispersion model on CPU...")
    model = DispersionPINN()

    # Simple, fast Adam optimizer
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    # 1. Training data: random grid collocation points
    np.random.seed(42)
    torch.manual_seed(42)
    n_collocation = 600

    # Inputs: x (0 to 15 km), y (-7.5 to 7.5 km), t (0 to 24 hours), S (0 to 100), wind_speed (1 to 25 km/h)
    xyt_sw = torch.rand((n_collocation, 5))
    xyt_sw[:, 0] = xyt_sw[:, 0] * 15.0
    xyt_sw[:, 1] = (xyt_sw[:, 1] - 0.5) * 15.0
    xyt_sw[:, 2] = xyt_sw[:, 2] * 24.0
    xyt_sw[:, 3] = xyt_sw[:, 3] * 100.0
    xyt_sw[:, 4] = 1.0 + xyt_sw[:, 4] * 24.0

    # 2. Boundary condition data: at the source (x=0, y=0)
    n_bc = 150
    bc_points = torch.zeros((n_bc, 5))
    bc_points[:, 2] = torch.rand(n_bc) * 24.0
    bc_points[:, 3] = torch.rand(n_bc) * 100.0
    bc_points[:, 4] = 1.0 + torch.rand(n_bc) * 24.0

    # Run a fast optimization loop (120 epochs is extremely quick on CPU)
    for epoch in range(120):
        optimizer.zero_grad()

        # PDE residual loss
        loss_pde = model.physics_loss(xyt_sw, D=0.15, k=0.05)

        # Boundary condition loss: predicted concentration at (0,0) should match source strength
        pred_bc = model(bc_points)
        loss_bc = torch.mean((pred_bc - bc_points[:, 3:4])**2)

        loss = loss_pde + 10.0 * loss_bc
        loss.backward()
        optimizer.step()

    logger.info("PINN dispersion model online training complete.")
    GLOBAL_PINN = model
    return GLOBAL_PINN

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

    # Angle difference from wind vector
    angle_diff = abs(disp_angle - blow_rad)
    angle_diff = (angle_diff + math.pi) % (2 * math.pi) - math.pi

    # Check if target is downwind (within 45 degrees of wind blow direction)
    is_downwind = abs(angle_diff) < 0.78

    if not is_downwind:
        return 0.0

    if TORCH_AVAILABLE:
        try:
            model = get_trained_pinn()
            if model is not None:
                # Align coordinates along wind direction
                x_wind = distance_km * math.cos(angle_diff)
                y_wind = distance_km * math.sin(angle_diff)

                inputs = torch.tensor([[x_wind, y_wind, hours, strength, wind_speed]], dtype=torch.float32)
                model.eval()
                with torch.no_grad():
                    pred = float(model(inputs).numpy()[0][0])
                # Guarantee that PINN concentration doesn't exceed source strength
                return min(strength, max(0.0, pred))
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
