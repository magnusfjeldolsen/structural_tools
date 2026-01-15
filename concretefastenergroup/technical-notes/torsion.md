# Fastener Forces Due to Torsion About the Z-Axis

This document explains, step by step, how to compute the **x- and y-components (with correct sign)**
of fastener forces caused by a **torsional moment about the vertical (z) axis**.

This method applies to bolt or fastener groups lying in the **x–y plane**.

---

## 1. Coordinate System and Assumptions

- Fasteners lie in the x–y plane
- z-axis is vertical, positive upward
- Torsional moment Mz acts about the z-axis
- Torsion causes **shear forces in the x–y plane**
- Forces are tangent to rotation

Sign convention:
- +Mz = counter-clockwise (CCW) when viewed from +z
- −Mz = clockwise (CW)

---

## 2. Shift Coordinates to the Centroid

All torsion calculations must use coordinates relative to the centroid of the fastener group.

For each fastener:

x_i = x − x_c  
y_i = y − y_c  

Where:
- (x_c, y_c) is the centroid of the fastener group

---

## 3. Distance From Centroid

Distance of fastener i from centroid:

r_i = sqrt( x_i² + y_i² )

---

## 4. Polar Moment of Inertia of the Fastener Group

For discrete fasteners:

J = sum( r_i² )

This represents the torsional resistance of the fastener pattern.

---

## 5. Magnitude of Torsional Force in Each Fastener

The **magnitude only** of the torsional force in fastener i is:

F_i = ( Mz * r_i ) / sum( r_j² )

Where:
- Mz = applied torsional moment
- r_i = distance of fastener i from centroid

This gives force magnitude, **not direction**.

---

## 6. Direction of Torsional Force

### Key Physical Rule

The torsional force at each fastener is:

- Tangent to the rotation
- Perpendicular to the radius vector from the centroid

Radius vector:
r_i = ( x_i , y_i )

The force direction is obtained by rotating this vector by 90°.

---

## 7. Force Components for +Mz (Counter-Clockwise)

For a **positive torsional moment (+Mz)**:

Fx_i = −F_i * ( y_i / r_i )  
Fy_i =  +F_i * ( x_i / r_i )

This corresponds to rotating the radius vector **+90°**.

---

## 8. Force Components for −Mz (Clockwise)

For a **negative torsional moment (−Mz)**:

Fx_i =  +F_i * ( y_i / r_i )  
Fy_i =  −F_i * ( x_i / r_i )

This corresponds to rotating the radius vector **−90°**.

---

## 9. Example: Square Fastener Pattern

Fasteners located at:
- (±50, ±50) mm
- Centroid at (0, 0)
- r_i = 70.71 mm
- F_i = 35355 N
- +Mz applied

| x (mm) | y (mm) | Fx (N) | Fy (N) |
|-------|-------|--------|--------|
|  50 |  50 | −25,000 | +25,000 |
| −50 |  50 | −25,000 | −25,000 |
| −50 | −50 | +25,000 | −25,000 |
|  50 | −50 | +25,000 | +25,000 |

---

## 10. Required Verification Checks

Always verify the following:

1. Perpendicularity  
Fx_i * x_i + Fy_i * y_i = 0

2. Force equilibrium  
sum(Fx_i) = 0  
sum(Fy_i) = 0  

3. Moment recovery  
sum( x_i * Fy_i − y_i * Fx_i ) = Mz

If all checks pass, the signs and magnitudes are correct.

---

## 11. Summary

- Use centroid-shifted coordinates
- Compute torsional force magnitude using distance from centroid
- Resolve forces tangentially
- Apply right-hand-rule sign convention
- Always verify equilibrium and torque balance

This approach is robust and suitable for spreadsheets, scripts, and design calculations.
