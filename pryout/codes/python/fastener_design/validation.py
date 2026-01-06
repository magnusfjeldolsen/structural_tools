"""
Validation utilities for fastener design

Provides functions to validate geometry, materials, and design inputs
against EC2 Part 4 requirements.
"""

from typing import Dict, List, Tuple
import warnings


def validate_minimum_spacing(
    spacing: float,
    fastener_diameter: float,
    min_factor: float = 2.0
) -> Tuple[bool, str]:
    """
    Validate minimum spacing between fasteners

    Typical minimum: s_min = 2.0 × d (may vary by fastener type)

    Args:
        spacing: Actual spacing [mm]
        fastener_diameter: Fastener diameter d [mm]
        min_factor: Minimum spacing factor (default 2.0)

    Returns:
        (is_valid, message): Validation result and message

    Standard: EC2-4-1, varies by fastener type
    """
    s_min = min_factor * fastener_diameter

    if spacing < s_min:
        return False, (
            f"Spacing {spacing:.1f}mm is less than minimum {s_min:.1f}mm "
            f"({min_factor}×d). Check code requirements."
        )

    return True, "OK"


def validate_minimum_edge_distance(
    edge_distance: float,
    fastener_diameter: float,
    min_factor: float = 1.5
) -> Tuple[bool, str]:
    """
    Validate minimum edge distance

    Typical minimum: c_min = 1.5 × d (may vary)

    Args:
        edge_distance: Actual edge distance [mm]
        fastener_diameter: Fastener diameter d [mm]
        min_factor: Minimum edge distance factor (default 1.5)

    Returns:
        (is_valid, message): Validation result and message
    """
    c_min = min_factor * fastener_diameter

    if edge_distance < c_min:
        return False, (
            f"Edge distance {edge_distance:.1f}mm is less than minimum "
            f"{c_min:.1f}mm ({min_factor}×d). Check code requirements."
        )

    return True, "OK"


def validate_embedment_depth(
    embedment_depth: float,
    fastener_diameter: float,
    min_ratio: float = 3.0
) -> Tuple[bool, str]:
    """
    Validate embedment depth

    Typical minimum: hef_min = 3.0 × d

    Args:
        embedment_depth: Effective embedment depth hef [mm]
        fastener_diameter: Fastener diameter d [mm]
        min_ratio: Minimum hef/d ratio (default 3.0)

    Returns:
        (is_valid, message): Validation result
    """
    hef_min = min_ratio * fastener_diameter

    if embedment_depth < hef_min:
        return False, (
            f"Embedment depth {embedment_depth:.1f}mm is less than minimum "
            f"{hef_min:.1f}mm ({min_ratio}×d)."
        )

    return True, "OK"


def validate_member_thickness(
    thickness: float,
    embedment_depth: float,
    min_cover: float = 50.0
) -> Tuple[bool, str]:
    """
    Validate member thickness relative to embedment

    Args:
        thickness: Member thickness h [mm]
        embedment_depth: Embedment depth hef [mm]
        min_cover: Minimum cover to back face [mm]

    Returns:
        (is_valid, message): Validation result
    """
    required_thickness = embedment_depth + min_cover

    if thickness < required_thickness:
        return False, (
            f"Member thickness {thickness:.1f}mm is less than required "
            f"{required_thickness:.1f}mm (hef + cover)."
        )

    return True, "OK"


def validate_concrete_strength(
    fck: float,
    min_strength: float = 12.0,
    max_strength: float = 90.0
) -> Tuple[bool, str]:
    """
    Validate concrete strength is in code range

    Args:
        fck: Characteristic cylinder strength [N/mm²]
        min_strength: Minimum allowed strength (default 12 MPa)
        max_strength: Maximum allowed strength (default 90 MPa)

    Returns:
        (is_valid, message): Validation result

    Note:
        Range may vary by fastener type and European Technical Specification
    """
    if fck < min_strength:
        return False, (
            f"Concrete strength {fck:.1f} MPa is below minimum {min_strength} MPa."
        )

    if fck > max_strength:
        return False, (
            f"Concrete strength {fck:.1f} MPa exceeds maximum {max_strength} MPa. "
            f"Check code applicability."
        )

    return True, "OK"


def validate_fastener_geometry(
    fastener_dict: Dict,
    concrete_thickness: float = None
) -> Tuple[bool, List[str]]:
    """
    Comprehensive validation of fastener geometry

    Args:
        fastener_dict: Dictionary with fastener properties
                      {'d': ..., 'hef': ..., 'fuk': ...}
        concrete_thickness: Optional member thickness [mm]

    Returns:
        (is_valid, messages): Overall validity and list of messages

    Example:
        >>> from fastener_design import Fastener
        >>> fastener = Fastener(16, 100, 500)
        >>> is_valid, msgs = validate_fastener_geometry(
        ...     fastener.to_dict(),
        ...     concrete_thickness=200
        ... )
    """
    messages = []
    is_valid = True

    d = fastener_dict.get('d', 0)
    hef = fastener_dict.get('hef', 0)
    fuk = fastener_dict.get('fuk', 0)

    # Validate embedment depth
    valid, msg = validate_embedment_depth(hef, d)
    if not valid:
        is_valid = False
        messages.append(msg)

    # Validate member thickness if provided
    if concrete_thickness is not None:
        valid, msg = validate_member_thickness(concrete_thickness, hef)
        if not valid:
            is_valid = False
            messages.append(msg)

    # Basic range checks
    if d <= 0 or hef <= 0 or fuk <= 0:
        is_valid = False
        messages.append("All dimensions and strengths must be positive")

    if not messages:
        messages.append("All geometry checks passed")

    return is_valid, messages


def validate_fastener_group_geometry(
    group_dict: Dict,
    fastener_dict: Dict
) -> Tuple[bool, List[str]]:
    """
    Comprehensive validation of fastener group geometry

    Args:
        group_dict: Dictionary with group properties
                   {'sx': ..., 'sy': ..., 'c1': ..., 'c2': ...}
        fastener_dict: Dictionary with fastener properties

    Returns:
        (is_valid, messages): Overall validity and list of messages
    """
    messages = []
    is_valid = True

    d = fastener_dict.get('d', 0)
    sx = group_dict.get('sx', 0)
    sy = group_dict.get('sy', 0)
    c1 = group_dict.get('c1', 0)
    c2 = group_dict.get('c2', 0)

    # Validate spacing
    if sx > 0:
        valid, msg = validate_minimum_spacing(sx, d)
        if not valid:
            is_valid = False
            messages.append(f"x-spacing: {msg}")

    if sy > 0:
        valid, msg = validate_minimum_spacing(sy, d)
        if not valid:
            is_valid = False
            messages.append(f"y-spacing: {msg}")

    # Validate edge distances
    if c1 > 0:
        valid, msg = validate_minimum_edge_distance(c1, d)
        if not valid:
            is_valid = False
            messages.append(f"Edge c1: {msg}")

    if c2 > 0:
        valid, msg = validate_minimum_edge_distance(c2, d)
        if not valid:
            is_valid = False
            messages.append(f"Edge c2: {msg}")

    if not messages:
        messages.append("All group geometry checks passed")

    return is_valid, messages


def check_code_applicability(
    fastener_dict: Dict,
    concrete_dict: Dict
) -> List[str]:
    """
    Check overall code applicability and warn of limitations

    Args:
        fastener_dict: Fastener properties
        concrete_dict: Concrete properties

    Returns:
        List of warning messages (empty if all OK)

    Standard: EC2-4-1 Section 1 (Scope)
    """
    warnings_list = []

    d = fastener_dict.get('d', 0)
    fck = concrete_dict.get('fck', 0)

    # Diameter range
    if d < 6:
        warnings_list.append(
            f"Fastener diameter {d}mm is very small. Code may not apply."
        )
    elif d > 100:
        warnings_list.append(
            f"Fastener diameter {d}mm is very large. Verify code applicability."
        )

    # Concrete strength range
    if fck < 12:
        warnings_list.append(
            f"Concrete strength {fck} MPa is below typical minimum (C12/15)."
        )
    elif fck > 90:
        warnings_list.append(
            f"Concrete strength {fck} MPa is very high. Check ETS limits."
        )

    return warnings_list
