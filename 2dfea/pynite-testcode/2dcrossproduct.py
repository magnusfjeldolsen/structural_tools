import tkinter as tk
from tkinter import ttk
import math

def calculate_values():
    try:
        # Read values
        ax = float(ax_entry.get())
        ay = float(ay_entry.get())
        bx = float(bx_entry.get())
        by = float(by_entry.get())

        # 2D cross product (scalar)
        cross = ax * by - ay * bx

        # Magnitudes
        mag_a = math.sqrt(ax**2 + ay**2)
        mag_b = math.sqrt(bx**2 + by**2)

        # Directions (angles)
        angle_a = math.degrees(math.atan2(ay, ax))
        angle_b = math.degrees(math.atan2(by, bx))

        # Display results
        result_label.config(text=f"Cross Product (scalar): {cross:.4f}")
        mag_label.config(text=f"Vector A Magnitude: {mag_a:.4f}   |   Vector B Magnitude: {mag_b:.4f}")
        angle_label.config(text=f"Vector A Angle: {angle_a:.2f}°   |   Vector B Angle: {angle_b:.2f}°")

    except ValueError:
        result_label.config(text="Please enter valid numeric values.")
        mag_label.config(text="")
        angle_label.config(text="")

# Main window
root = tk.Tk()
root.title("2D Vector Calculator")
root.geometry("420x300")

# Vector A Inputs
ttk.Label(root, text="Vector A").grid(row=0, column=0, pady=5)
ttk.Label(root, text="Ax:").grid(row=1, column=0)
ax_entry = ttk.Entry(root)
ax_entry.grid(row=1, column=1)

ttk.Label(root, text="Ay:").grid(row=2, column=0)
ay_entry = ttk.Entry(root)
ay_entry.grid(row=2, column=1)

# Vector B Inputs
ttk.Label(root, text="Vector B").grid(row=3, column=0, pady=10)
ttk.Label(root, text="Bx:").grid(row=4, column=0)
bx_entry = ttk.Entry(root)
bx_entry.grid(row=4, column=1)

ttk.Label(root, text="By:").grid(row=5, column=0)
by_entry = ttk.Entry(root)
by_entry.grid(row=5, column=1)

# Calculate Button
calc_button = ttk.Button(root, text="Calculate", command=calculate_values)
calc_button.grid(row=6, column=0, columnspan=2, pady=15)

# Results
result_label = ttk.Label(root, text="Cross Product (scalar):")
result_label.grid(row=7, column=0, columnspan=2)

mag_label = ttk.Label(root, text="")
mag_label.grid(row=8, column=0, columnspan=2)

angle_label = ttk.Label(root, text="")
angle_label.grid(row=9, column=0, columnspan=2)

root.mainloop()
