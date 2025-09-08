import os
import tkinter as tk
from tkinter import filedialog, messagebox
import pyperclip

def select_files():
    file_paths = filedialog.askopenfilenames(filetypes=[("PDF Files", "*.pdf")])
    if file_paths:
        list_pdfs(file_paths)

def list_pdfs(files):
    file_listbox.delete(0, tk.END)
    for file in files:
        file_listbox.insert(tk.END, os.path.basename(file))
    file_listbox.select_set(0, tk.END)  # Automatically select all files

def split_filename():
    split_str = split_entry.get()
    exclude_extension = exclude_var.get()
    selected_files = file_listbox.curselection()
    if not selected_files:
        messagebox.showwarning("No file selected", "Please select at least one file.")
        return

    result_text = ""
    for i in selected_files:
        filename = file_listbox.get(i)
        if exclude_extension:
            filename = filename.rsplit(".pdf", 1)[0]  # Remove .pdf extension
        
        if split_str and split_str in filename:
            parts = filename.split(split_str, 1)
            result_text += f"{parts[0]}\t{parts[1]}\n"
        else:
            result_text += f"{filename}\n"
    
    pyperclip.copy(result_text.strip())
    result_textbox.delete(1.0, tk.END)
    result_textbox.insert(tk.END, result_text.strip())
    messagebox.showinfo("Copied", "The split filenames have been copied to the clipboard.")

# UI setup
root = tk.Tk()
root.title("PDF Filename Splitter")
root.geometry("600x500")
root.minsize(400, 300)
root.resizable(True, True)

tk.Label(root, text="Select PDF Files:").pack()
tk.Button(root, text="Browse", command=select_files).pack()

file_frame = tk.Frame(root)
file_frame.pack(fill=tk.BOTH, expand=True)
file_scrollbar = tk.Scrollbar(file_frame, orient=tk.VERTICAL)
file_listbox = tk.Listbox(file_frame, selectmode=tk.MULTIPLE, width=80, height=10, yscrollcommand=file_scrollbar.set)
file_scrollbar.config(command=file_listbox.yview)
file_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
file_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

tk.Label(root, text="Enter Split String:").pack()
split_frame = tk.Frame(root)
split_frame.pack(fill=tk.X)
split_scrollbar = tk.Scrollbar(split_frame, orient=tk.HORIZONTAL)
split_entry = tk.Entry(split_frame, width=50, xscrollcommand=split_scrollbar.set)
split_scrollbar.config(command=split_entry.xview)
split_entry.insert(0, " - ")
split_scrollbar.pack(side=tk.BOTTOM, fill=tk.X)
split_entry.pack(fill=tk.X, expand=True)

exclude_var = tk.BooleanVar(value=True)
tk.Checkbutton(root, text="Exclude .pdf extension", variable=exclude_var).pack()

tk.Button(root, text="Split and Copy", command=split_filename).pack()

tk.Label(root, text="Preview Output:").pack()
preview_frame = tk.Frame(root)
preview_frame.pack(fill=tk.BOTH, expand=True)
preview_scrollbar = tk.Scrollbar(preview_frame, orient=tk.VERTICAL)
result_textbox = tk.Text(preview_frame, height=5, width=60, yscrollcommand=preview_scrollbar.set)
preview_scrollbar.config(command=result_textbox.yview)
preview_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
result_textbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

root.mainloop()
