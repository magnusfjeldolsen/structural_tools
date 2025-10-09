#%%
from functools import wraps
import structuralcodes
from structuralcodes.geometry import SurfaceGeometry, add_reinforcement,add_reinforcement_line
import numpy as np

#%%
def get_bottom_boundary_of_rectangle(rectangular_geometry):
    """
    Get the bottom boundary of a rectangle as two points.

    Parameters:
        rectangle (RectangularGeometry): The rectangle object. 


    """
    xmin,xmax,ymin,ymax = rectangular_geometry.calculate_extents()
    bottom_boundary_coords = np.array([[xmin,ymin],[xmax,ymin]])

    return bottom_boundary_coords

def get_top_boundary_of_rectangle(rectangular_geometry):
    """
    Get the bottom boundary of a rectangle as two points.

    Parameters:
        rectangle (Polygon/CompoundGeometry): The rectangle object. 

    """
    xmin,xmax,ymin,ymax = rectangular_geometry.calculate_extents()
    # PUT IN CORRECT ORDER SO THAT THE NORMAL POINTS INWARDS
    top_boundary_coords = np.array([[xmax,ymax],[xmin,ymax]])

    return top_boundary_coords

def get_left_boundary_of_rectangle(rectangular_geometry):
    """
    Get the bottom boundary of a rectangle as two points.

    Parameters:
        rectangle (RectangularGeometry): The rectangle object. 


    """
    xmin,xmax,ymin,ymax = rectangular_geometry.calculate_extents()
    left_boudnary_coords = np.array([[xmin,ymax],[xmin,ymin]])

    return left_boudnary_coords

def get_right_boundary_of_rectangle(rectangular_geometry):
    """
    Get the bottom boundary of a rectangle as two points.

    Parameters:
        rectangle (RectangularGeometry): The rectangle object. 


    """
    xmin,xmax,ymin,ymax = rectangular_geometry.calculate_extents()
    right_boudnary_coords = np.array([[xmax,ymin],[xmax,ymax]])

    return right_boudnary_coords

def normalize_vector(boundary_coords):
    
    v = boundary_coords[1] - boundary_coords[0]
    norm = np.linalg.norm(v)
    if norm == 0:
        raise ValueError("The two points are identical; direction vector is undefined.")
    return v / norm

def normalized_normal(points: np.ndarray) -> np.ndarray:
    """
    Calculate the normalized normal vector from two 2D points.
    
    Parameters:
        points (np.ndarray): Array of shape (2, 2) -> [[x1, y1], [x2, y2]]
    
    Returns:
        np.ndarray: Normalized normal vector (2,)
    """
    if points.shape != (2, 2):
        raise ValueError("Input must be a numpy array of shape (2, 2)")
    
    # Vector from p1 to p2
    v = points[1] - points[0]
    
    # Perpendicular (normal) vector in 2D: (x, y) -> (-y, x)
    normal = np.array([-v[1], v[0]])
    
    # Normalize the normal vector
    norm = np.linalg.norm(normal)
    if norm == 0:
        raise ValueError("The two points are identical; normal vector is undefined.")
    
    return normal / norm

def generate_reinforcement_line_coords_with_cover(boundary_coords,boundary_cover,start_cover=None,end_cover=None):
    """
    boundary_coords: np.ndarray of shape (2,2) -> [[x1,y1],[x2,y2]]
    boundary_cover: float
    start_cover: float or None
    end_cover: float or None
    returns: np.ndarray of shape (2,2) -> [[x1',y1'],[x2',y2']] that includes cover offsets
    
    """
    if boundary_coords.shape != (2, 2):
        raise ValueError("Input must be a numpy array of shape (2, 2)")
    if start_cover is None:
        start_cover = boundary_cover
    if end_cover is None:
        end_cover = boundary_cover
    # Calculate the normalized normal vector
    normal = normalized_normal(boundary_coords)

    unit_vector = normalize_vector(boundary_coords)
    # Offset the points by the cover distance
    offset_start = boundary_coords[0] + normal * boundary_cover + unit_vector*start_cover
    print(f"offset start: {offset_start}")
    offset_end = boundary_coords[1] + normal * end_cover - unit_vector*end_cover
    return np.array([offset_start, offset_end])

def generate_reinforcement_line_with_cover(geometry, reinforcement_line_coords, **kwargs):
    """
    Wrapper for add_reinforcement_line.
    Assumes reinforcement_line_coords already include any cover adjustments.
    Forwards all other arguments to add_reinforcement_line.
    """
    start_point, end_point = reinforcement_line_coords
    return add_reinforcement_line(geometry, start_point, end_point, **kwargs)

# Append the original docstring safely
if add_reinforcement_line.__doc__:
    generate_reinforcement_line_with_cover.__doc__ += "\n\nOriginal add_reinforcement_line docstring:\n" + add_reinforcement_line.__doc__


if __name__ == "__main__":
    # Example usage
    boundary_coords = np.array([[-100, -50], [100, -50]])
    cover = 15
    new_coords = generate_reinforcement_line_coords_with_cover(boundary_coords, cover)
    print("Original boundary coordinates:\n", boundary_coords)
    print("New coordinates with cover:\n", new_coords)





def get_geometry_rebar_area(geoemtry):

    total_area = 0
    for point in geoemtry.point_geometries:
        total_area += point.area

    return total_area


def get_section_rebar_area(section):

    total_area = 0
    for point in section.geometry.point_geometries:
        total_area += point.area

    return total_area

def get_rebar_area(obj):
    if hasattr(obj, 'point_geometries'):
        return get_geometry_rebar_area(obj)
    elif hasattr(obj, 'geometry'):
        return get_section_rebar_area(obj)
    else:
        raise TypeError("Input must be a Geometry or Section object with point geometries.")


# %%
