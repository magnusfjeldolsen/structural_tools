/**
 * LoadContextMenu Component
 * Floating context menu for load operations (Properties, Copy, Delete)
 */

import React, { useEffect, useRef } from 'react';
import { useModelStore, useUIStore } from '../store';

interface LoadContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  loadType: 'nodal' | 'distributed' | 'elementPoint' | null;
  loadIndex: number | null;
  onClose: () => void;
}

export function LoadContextMenu({ isOpen, position, loadType, loadIndex, onClose }: LoadContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteSelectedLoads = useModelStore((state) => state.deleteSelectedLoads);
  const selectLoad = useModelStore((state) => state.selectLoad);
  const loads = useModelStore((state) => state.loads);
  const openLoadDialog = useUIStore((state) => state.openLoadDialog);
  const setCopiedData = useUIStore((state) => state.setCopiedData);
  const setPasteMode = useUIStore((state) => state.setPasteMode);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !position || !loadType || loadIndex === null) {
    return null;
  }

  // Get the load data
  const loadData = loads[loadType === 'nodal' ? 'nodal' : loadType === 'distributed' ? 'distributed' : 'elementPoint'][loadIndex];
  if (!loadData) {
    return null;
  }

  const handleProperties = () => {
    selectLoad(loadType, loadIndex, false);
    const dialogType = loadType === 'nodal' ? 'nodal' : loadType === 'distributed' ? 'distributed' : 'point';
    openLoadDialog(dialogType, {
      type: loadType as 'nodal' | 'distributed',  // Cast to avoid type error
      index: loadIndex,
    });
    onClose();
  };

  const handleCopy = () => {
    // Copy load properties and auto-activate paste mode
    setCopiedData({
      entityType: 'load',
      loadType: loadType,
      properties: { ...loadData },
    });
    setPasteMode(true);
    onClose();
  };

  const handleDelete = () => {
    selectLoad(loadType, loadIndex, false);
    deleteSelectedLoads();
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${position.y}px`,
    left: `${position.x}px`,
    backgroundColor: '#1f2937',
    border: '1px solid #4b5563',
    borderRadius: '6px',
    padding: '4px 0',
    zIndex: 10000,
    minWidth: '180px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  };

  const itemStyle: React.CSSProperties = {
    padding: '10px 16px',
    fontSize: '13px',
    color: '#e5e7eb',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #374151',
    transition: 'background-color 0.15s',
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      <div
        style={itemStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = '#374151';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
        }}
        onClick={handleProperties}
      >
        ✏️ Properties
      </div>
      <div
        style={itemStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = '#374151';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
        }}
        onClick={handleCopy}
      >
        📋 Copy Properties
      </div>
      <div
        style={{ ...itemStyle, borderBottom: 'none' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = '#7f1d1d';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
        }}
        onClick={handleDelete}
      >
        🗑️ Delete
      </div>
    </div>
  );
}
