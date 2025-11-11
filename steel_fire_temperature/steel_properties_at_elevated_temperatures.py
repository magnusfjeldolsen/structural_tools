def interpolate_piecewise(data_dict, x_input):
    """
    Perform piecewise linear interpolation using the first key as x and second as y.

    Parameters:
    - data_dict: dict with two keys, each mapping to a list of values
    - x_input: input value to interpolate on the x-axis (first key)

    Returns:
    - Interpolated y value
    """
    keys = list(data_dict.keys())
    x_key, y_key = keys[0], keys[1]

    x = data_dict[x_key]
    y = data_dict[y_key]

    # Ensure the data is sorted by x
    xy_sorted = sorted(zip(x, y))
    x_sorted, y_sorted = zip(*xy_sorted)

    # Handle out-of-bounds
    if x_input <= x_sorted[0]:
        return y_sorted[0]
    elif x_input >= x_sorted[-1]:
        return y_sorted[-1]
    
    # Find the interval for interpolation
    for i in range(len(x_sorted) - 1):
        if x_sorted[i] <= x_input <= x_sorted[i + 1]:
            # Linear interpolation
            x0, y0 = x_sorted[i], y_sorted[i]
            x1, y1 = x_sorted[i + 1], y_sorted[i + 1]
            return y0 + (y1 - y0) * (x_input - x0) / (x1 - x0)
    
    # This should never be reached
    return None

def ky_theta_calc(theta_a):
    """
    theta_a: steel temperature in degrees celsius
    returns ky_theta, the reduction factor for yield strength of steel
    """
    ky_theta = interpolate_piecewise(ky_theta_data, theta_a)
    return ky_theta

def kp_theta_calc(theta_a):
    """
    theta_a: steel temperature in degrees celsius
    returns kp_theta, the reduction factor for proportional limit of steel
    """
    kp_theta = interpolate_piecewise(kp_theta_data, theta_a)
    return kp_theta

def kE_theta_calc(theta_a):
    """
    theta_a: steel temperature in degrees celsius
    returns kE_theta, the reduction factor for elastic modulus of steel
    """
    kE_theta = interpolate_piecewise(kE_theta_data, theta_a)
    return kE_theta

#%%
ky_theta_data = {
    "theta_a": [
        20,
        100,
        200,
        300,
        400,
        500,
        600,
        700,
        800,
        900,
        1000,
        1100,
        1200
    ],
    "ky_theta": [
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
        0.78,
        0.47,
        0.23,
        0.11,
        0.06,
        0.04,
        0.02,
        0.0
    ]
}

kp_theta_data = {
    "theta_a": [
        20,
        100,
        200,
        300,
        400,
        500,
        600,
        700,
        800,
        900,
        1000,
        1100,
        1200
    ],
    "kp_theta": [
        1.0,
        1.0,
        0.807,
        0.613,
        0.42,
        0.36,
        0.18,
        0.075,
        0.05,
        0.0375,
        0.025,
        0.0125,
        0.0
    ]
}


kE_theta_data = {
    "theta_a": [
        20,
        100,
        200,
        300,
        400,
        500,
        600,
        700,
        800,
        900,
        1000,
        1100,
        1200
    ],
    "kE_theta": [
        1.0,
        1.0,
        0.9,
        0.8,
        0.7,
        0.6,
        0.31,
        0.13,
        0.09,
        0.0675,
        0.045,
        0.0225,
        0.0
    ]
}
