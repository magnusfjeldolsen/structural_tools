"""
Setup script for fastener_design package

This allows the package to be installed with pip install -e .
or loaded by Pyodide in the browser using micropip.
"""

from setuptools import setup, find_packages

setup(
    name="fastener_design",
    version="1.0.0",
    description="EC2 Part 4 Fastener Design Calculator (CEN/TS 1992-4-1:2009 & 1992-4-2:2009)",
    author="EC2 Part 4 Implementation",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        # No external dependencies - pure Python implementation
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Scientific/Engineering",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
