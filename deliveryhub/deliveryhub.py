import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, simpledialog
import pyperclip
import json
import os
import webbrowser
from collections import OrderedDict

LAST_SESSION_FILE = "C:/ProgramData/collections/last_session.json"

class CollectionManager:
    """Handles all file collection logic and data management"""
    
    def __init__(self):
        self.collections = {"Calculations": OrderedDict(), "Documents": OrderedDict()}
        self.current_file = None
    
    def new_collection(self):
        """Create a new empty collection"""
        self.collections = {"calculations": OrderedDict(), "documents": OrderedDict()}
        self.current_file = None
    
    def add_file(self, category, filepath):
        """Add a file to the specified category. Returns True if added, False if already exists"""
        filename = os.path.basename(filepath)
        if filename not in self.collections[category]:
            self.collections[category][filename] = filepath
            return True
        return False
    
    def add_files(self, category, filepaths):
        """Add multiple files to a category. Returns count of files actually added"""
        added_count = 0
        for filepath in filepaths:
            if self.add_file(category, filepath):
                added_count += 1
        return added_count
    
    def remove_file(self, filename):
        """Remove a file by filename from all categories. Returns True if found and removed"""
        for category in self.collections:
            if filename in self.collections[category]:
                del self.collections[category][filename]
                return True
        return False
    
    def remove_files(self, filenames):
        """Remove multiple files. Returns count of files actually removed"""
        removed_count = 0
        for filename in filenames:
            if self.remove_file(filename):
                removed_count += 1
        return removed_count
    
    def get_all_paths(self):
        """Get all file paths from all categories"""
        paths = []
        for category in self.collections:
            paths.extend(self.collections[category].values())
        return paths
    
    def get_file_category(self, filename):
        """Find which category a filename belongs to"""
        for category in self.collections:
            if filename in self.collections[category]:
                return category
        return None
    
    def move_file_up(self, filename):
        """Move a file up in its category order. Returns True if moved"""
        category = self.get_file_category(filename)
        if not category:
            return False
            
        files_list = list(self.collections[category].items())
        current_pos = None
        
        for i, (fname, fpath) in enumerate(files_list):
            if fname == filename:
                current_pos = i
                break
                
        if current_pos is None or current_pos == 0:
            return False
            
        # Swap with previous item
        files_list[current_pos], files_list[current_pos - 1] = files_list[current_pos - 1], files_list[current_pos]
        
        # Rebuild the OrderedDict
        self.collections[category] = OrderedDict(files_list)
        return True
    
    def move_file_down(self, filename):
        """Move a file down in its category order. Returns True if moved"""
        category = self.get_file_category(filename)
        if not category:
            return False
            
        files_list = list(self.collections[category].items())
        current_pos = None
        
        for i, (fname, fpath) in enumerate(files_list):
            if fname == filename:
                current_pos = i
                break
                
        if current_pos is None or current_pos == len(files_list) - 1:
            return False
            
        # Swap with next item
        files_list[current_pos], files_list[current_pos + 1] = files_list[current_pos + 1], files_list[current_pos]
        
        # Rebuild the OrderedDict
        self.collections[category] = OrderedDict(files_list)
        return True
    
    def save(self, filepath=None):
        """Save collection to file. Uses current_file if filepath not provided"""
        if filepath:
            self.current_file = filepath
        
        if not self.current_file:
            raise ValueError("No file path specified for saving")
            
        # Convert OrderedDict to regular dict for JSON serialization
        data_to_save = {}
        for category, files in self.collections.items():
            data_to_save[category] = dict(files)
            
        with open(self.current_file, "w") as f:
            json.dump(data_to_save, f, indent=4)
    
    def load(self, filepath):
        """Load collection from file"""
        with open(filepath, "r") as f:
            data = json.load(f)
            self.collections = {
                "calculations": OrderedDict(data.get("calculations", {})),
                "documents": OrderedDict(data.get("documents", {}))
            }
        self.current_file = filepath
    
    def save_last_session_path(self):
        """Save the current file path as the last session"""
        if not self.current_file:
            return
            
        try:
            os.makedirs(os.path.dirname(LAST_SESSION_FILE), exist_ok=True)
            with open(LAST_SESSION_FILE, "w") as f:
                json.dump({"last_collection_path": self.current_file}, f)
        except Exception:
            pass  # Fail silently
    
    def try_restore_last_session(self):
        """Attempt to restore the last session"""
        if not os.path.exists(LAST_SESSION_FILE):
            return False
            
        try:
            with open(LAST_SESSION_FILE, "r") as f:
                data = json.load(f)
                last_path = data.get("last_collection_path", "")
                if last_path and os.path.exists(last_path):
                    self.load(last_path)
                    return True
        except Exception:
            pass  # Fail silently
        return False


class FileSelectorApp:
    """Main UI application class"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("File Path Collector")
        
        self.manager = CollectionManager()
        self.category_var = tk.StringVar(value="calculations")

        self.create_menu()
        self.create_widgets()
        self.manager.try_restore_last_session()
        self.update_document_list()

    def new_collection(self):
        confirm = messagebox.askyesno("New Collection", "Start a new collection?\nUnsaved changes will be lost.")
        if confirm:
            self.manager.new_collection()
            self.update_document_list()

    def create_menu(self):
        menubar = tk.Menu(self.root)
        filemenu = tk.Menu(menubar, tearoff=0)
        filemenu.add_command(label="New Collection", command=self.new_collection)
        filemenu.add_separator()
        filemenu.add_command(label="Open Collection...", command=self.open_collection)
        filemenu.add_command(label="Save Collection", command=self.save_collection)
        filemenu.add_command(label="Save Collection As...", command=self.save_collection_as)
        filemenu.add_command(label="Exit", command=self.root.quit)
        menubar.add_cascade(label="File", menu=filemenu)
        self.root.config(menu=menubar)

    def create_widgets(self):
        # Top row: Category selection and Add Files (fixed header)
        header_frame = tk.Frame(self.root)
        header_frame.grid(row=0, column=0, sticky="ew", padx=5, pady=5)
        header_frame.columnconfigure(2, weight=1)  # Make Add Files button expand
        
        tk.Label(header_frame, text="Select Category:").grid(row=0, column=0, sticky="w", padx=(0, 5))
        category_menu = tk.OptionMenu(header_frame, self.category_var, "calculations", "documents")
        category_menu.grid(row=0, column=1, sticky="w", padx=(0, 10))

        self.select_button = tk.Button(header_frame, text="➕ Add Files to Category", command=self.select_files)
        self.select_button.grid(row=0, column=2, sticky="ew")

        # Create main PanedWindow for resizable columns
        self.main_paned = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, sashwidth=5, 
                                        sashrelief=tk.RAISED, bg='lightgray')
        self.main_paned.grid(row=1, column=0, sticky="nsew", padx=5, pady=(0, 5))

        # Left pane: File list
        list_frame = tk.Frame(self.main_paned)
        self.doc_listbox = tk.Listbox(list_frame, selectmode=tk.EXTENDED, activestyle='dotbox')
        self.doc_listbox.pack(fill="both", expand=True)
        
        # Add the list frame to the paned window
        self.main_paned.add(list_frame, minsize=300, width=550)  # Minimum width and initial width

        # Right pane: Control panel (buttons + move controls)
        control_frame = tk.Frame(self.main_paned)
        
        # Create nested PanedWindow for button panel and move buttons
        self.control_paned = tk.PanedWindow(control_frame, orient=tk.HORIZONTAL, sashwidth=3,
                                          sashrelief=tk.RAISED, bg='lightgray')
        self.control_paned.pack(fill="both", expand=True)

        # Button panel frame
        button_frame = tk.Frame(self.control_paned, relief=tk.RAISED, bd=1)
        
        # Sidebar buttons (stacked vertically)
        button_width = 15
        
        self.remove_button = tk.Button(button_frame, text="🗑️ Remove Selected", 
                                     command=self.remove_document, width=button_width)
        self.remove_button.pack(fill="x", padx=2, pady=2)

        self.open_button = tk.Button(button_frame, text="📂 Open Selected", 
                                   command=self.open_selected_documents, width=button_width)
        self.open_button.pack(fill="x", padx=2, pady=2)

        self.copy_button = tk.Button(button_frame, text="📋 Copy Paths", 
                                   command=self.copy_to_clipboard, width=button_width)
        self.copy_button.pack(fill="x", padx=2, pady=2)

        self.save_button = tk.Button(button_frame, text="💾 Save Collection", 
                                   command=self.save_collection, width=button_width)
        self.save_button.pack(fill="x", padx=2, pady=2)

        # Move Up/Down buttons frame
        move_frame = tk.Frame(self.control_paned)
        
        self.move_up_button = tk.Button(move_frame, text="▲", font=("Arial", 12, "bold"), 
                                       command=self.move_up, width=3, height=1)
        self.move_up_button.pack(pady=(5, 2), anchor="n")

        self.move_down_button = tk.Button(move_frame, text="▼", font=("Arial", 12, "bold"), 
                                         command=self.move_down, width=3, height=1)
        self.move_down_button.pack(anchor="n")

        # Add frames to the control paned window
        self.control_paned.add(button_frame, minsize=120, width=150)  # Button panel
        self.control_paned.add(move_frame, minsize=40, width=50)     # Move buttons

        # Add the control frame to the main paned window
        self.main_paned.add(control_frame, minsize=160, width=200)   # Total control panel

        # Configure grid weights for proper resizing
        self.root.rowconfigure(1, weight=1)  # Main content area expands
        self.root.columnconfigure(0, weight=1)  # Full width expansion

    def get_file_from_listbox_entry(self, entry):
        """Extract filename and category from a listbox entry"""
        entry = entry.strip()
        
        # Skip headers and empty lines
        if entry.startswith("---") or entry == "" or not entry:
            return None, None
            
        if ": " in entry:
            filename = entry.split(": ")[0].strip()
            category = self.manager.get_file_category(filename)
            return filename, category
        return None, None

    def move_up(self):
        selected_indices = self.doc_listbox.curselection()
        if len(selected_indices) != 1:
            messagebox.showinfo("Select one item", "Please select exactly one document to move up.")
            return
            
        idx = selected_indices[0]
        entry = self.doc_listbox.get(idx)
        filename, category = self.get_file_from_listbox_entry(entry)
        
        if not filename or not category:
            messagebox.showinfo("Invalid selection", "Please select a valid document (not a category header).")
            return
            
        if self.manager.move_file_up(filename):
            self.update_document_list()
            self.select_file_in_list(filename, category)
        else:
            messagebox.showinfo("Cannot move", "File is already at the top of its category.")

    def move_down(self):
        selected_indices = self.doc_listbox.curselection()
        if len(selected_indices) != 1:
            messagebox.showinfo("Select one item", "Please select exactly one document to move down.")
            return
            
        idx = selected_indices[0]
        entry = self.doc_listbox.get(idx)
        filename, category = self.get_file_from_listbox_entry(entry)
        
        if not filename or not category:
            messagebox.showinfo("Invalid selection", "Please select a valid document (not a category header).")
            return
            
        if self.manager.move_file_down(filename):
            self.update_document_list()
            self.select_file_in_list(filename, category)
        else:
            messagebox.showinfo("Cannot move", "File is already at the bottom of its category.")

    def select_file_in_list(self, filename, category):
        """Select a specific file in the listbox after updating"""
        for i in range(self.doc_listbox.size()):
            entry = self.doc_listbox.get(i)
            if entry.startswith(filename + ": "):
                self.doc_listbox.selection_set(i)
                self.doc_listbox.see(i)
                break

    def select_files(self):
        selected_files = filedialog.askopenfilenames(title="Select Files")
        if not selected_files:
            return

        category = self.category_var.get()
        added_count = self.manager.add_files(category, selected_files)

        if added_count > 0:
            self.update_document_list()
            messagebox.showinfo("Added", f"{added_count} file(s) added to '{category}' category.")
        else:
            messagebox.showinfo("No new files", "Selected files are already in the collection.")

    def update_document_list(self):
        self.doc_listbox.delete(0, tk.END)
        for category, files in self.manager.collections.items():
            self.doc_listbox.insert(tk.END, f"--- {category.upper()} ---")
            for fname, fpath in files.items():
                self.doc_listbox.insert(tk.END, f"{fname}: {fpath}")
            self.doc_listbox.insert(tk.END, "")  # empty line between categories

    def copy_to_clipboard(self):
        paths = self.manager.get_all_paths()
        if paths:
            pyperclip.copy("\n".join(paths))
            messagebox.showinfo("Copied", "File paths copied to clipboard!")
        else:
            messagebox.showwarning("Empty", "No file paths to copy.")

    def open_selected_documents(self):
        selected_indices = self.doc_listbox.curselection()
        if not selected_indices:
            messagebox.showinfo("None selected", "Please select at least one document to open.")
            return

        opened_any = False

        for idx in selected_indices:
            entry = self.doc_listbox.get(idx).strip()

            # Skip headers and empty lines
            if entry.startswith("---") or entry == "(No files)" or not entry:
                continue

            try:
                # Split after the first ": " only
                if ": " in entry:
                    parts = entry.split(": ", 1)  # Only split once
                    if len(parts) == 2:
                        path = parts[1].strip()
                        if os.path.exists(path):
                            webbrowser.open(path)
                            opened_any = True
            except Exception:
                continue

        if not opened_any:
            messagebox.showwarning("No Files Opened", "No valid document paths found or opened.")

    def remove_document(self):
        selected_indices = self.doc_listbox.curselection()
        if not selected_indices:
            messagebox.showinfo("None selected", "Please select at least one document to remove.")
            return

        filenames_to_remove = []
        for idx in selected_indices:
            entry = self.doc_listbox.get(idx)
            if ":" in entry:
                filename = entry.split(":")[0].strip()
                filenames_to_remove.append(filename)

        removed_count = self.manager.remove_files(filenames_to_remove)
        
        if removed_count > 0:
            self.update_document_list()
            messagebox.showinfo("Removed", f"{removed_count} document(s) removed.")
        else:
            messagebox.showwarning("Not found", "No matching documents found.")

    def save_collection(self):
        if self.manager.current_file:
            try:
                self.manager.save()
                messagebox.showinfo("Saved", f"Collection saved to:\n{self.manager.current_file}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save collection:\n{e}")
        else:
            # If no current file, ask Save As
            self.save_collection_as()

    def save_collection_as(self):
        filepath = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            title="Save Collection As"
        )
        if not filepath:
            return
        
        try:
            self.manager.save(filepath)
            self.manager.save_last_session_path()
            messagebox.showinfo("Saved", f"Collection saved to:\n{filepath}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save collection:\n{e}")

    def open_collection(self):
        filepath = filedialog.askopenfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            title="Open Collection"
        )
        if not filepath:
            return
        
        try:
            self.manager.load(filepath)
            self.update_document_list()
            messagebox.showinfo("Loaded", f"Collection loaded from:\n{filepath}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to open collection:\n{e}")


if __name__ == "__main__":
    root = tk.Tk()
    root.geometry("900x550")  # Made slightly taller to accommodate new buttons
    app = FileSelectorApp(root)
    root.mainloop()