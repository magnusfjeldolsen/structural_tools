# Loads Tab Implementation Plan

## Implementation Status

### Completed Phases

**Phase 1: ✅ Load ID Generation**
- Load IDs added to all load types (nodal, distributed, elementPoint)
- Auto-generated on creation (NL1, DL1, PL1, etc.)
- Preserved during updates

**Phase 2: ✅ LoadsTab Component Structure**
- Created LoadsTab.tsx as main container
- Integrated with UIStore (activeTab tracking)
- Keyboard event handling at container level (handleKeyDown)
- Clipboard state management (selectedCell, editingCell, editValue, clipboard)

**Phase 3: ✅ Individual Load Tables (Read-Only)**
- NodalLoadTable.tsx: ID | Case | Fx | Fy | Mz (5 columns)
- DistributedLoadTable.tsx: ID | Case | W1 | W2 | X1 | X2 | Direction (7 columns)
- PointLoadTable.tsx: ID | Case | Distance | Magnitude | Direction (5 columns)
- Each table has its own header with column labels
- Empty state messaging when no loads present

**Phase 4: ✅ Keyboard Navigation**
- Arrow Up/Down: Navigate between rows in same table
- Arrow Left/Right: Navigate between columns in same row
- Field order defined per load type:
  - Nodal: [id, case, fx, fy, mz]
  - Distributed: [id, case, w1, w2, x1, x2, direction]
  - Point: [id, case, distance, magnitude, direction]
- Cell selection with visual blue outline

**Phase 5: ✅ Edit Mode**
- F2: Enter edit mode for selected cell
- Enter: Save changes to store
- Escape: Cancel edit without saving
- Input validation with safe number parsing
- Input focus management with useRef

**Phase 6: ✅ Copy/Paste Functionality**
- Ctrl+C: Copy numeric value from editable cells
- Ctrl+V: Paste to compatible editable cells
- Clipboard tracks: value, type ('value' or 'position'), sourceLoadType
- Type matching:
  - Value type: Compatible with all numeric fields
  - Position type: Compatible with distance, x1, x2 fields
- Visual green highlight for paste-compatible cells

### Current Phase: Phase 7

**Phase 7: Polish UI and Add Visual Feedback**

Status: Ready to implement

## Phase 7 Implementation Plan

### Step 1: Verify Visual Feedback Styling
**Objective**: Ensure visual consistency with Nodes tab

Current implementation:
- `selectedCellStyle`: Blue outline (border and background)
- `editingCellStyle`: Yellow background
- `pasteCellStyle`: Green background (for cells that can accept paste)

Tasks:
- [ ] Test that selected cells show blue outline correctly
- [ ] Test that editing cells show yellow background
- [ ] Test that paste-compatible cells show green highlight when clipboard has value
- [ ] Compare colors with Nodes tab styling (verify consistency)
- [ ] Verify colors are accessible (sufficient contrast)

### Step 2: Direction Field Behavior
**Objective**: Clarify direction field functionality

Current status: Direction field is read-only (plain div)

Decision needed:
- Option A: Keep read-only (simpler, matches current behavior)
- Option B: Make editable with dropdown (more feature-complete)

Recommend: Keep read-only for now, add dropdown in future phase if needed

Tasks:
- [ ] Verify direction field is clearly non-interactive
- [ ] Consider adding visual indicator (lighter color, cursor not-allowed)
- [ ] Document that direction is read-only in header comment

### Step 3: Load Type Section Headers
**Objective**: Verify section headers are clear and functional

Current implementation:
- Section titles: "Nodal Loads (3)", "Distributed Loads (0)", etc.
- Shows count of loads in active load case
- Light gray background (bgLight theme color)

Spec mentions: "collapsible sections" (not yet implemented - may be optional)

Tasks:
- [ ] Verify section counts update correctly when loads added/removed
- [ ] Verify correct load case filtering is applied
- [ ] Test empty state messages display correctly
- [ ] Decide if collapse/expand needed (likely optional, skip for now)

### Step 4: Keyboard Navigation Polish
**Objective**: Ensure smooth keyboard experience across all tables

Current implementation:
- Arrow key navigation works within each table
- Field order defined per load type
- Tab key: Not yet implemented (spec mentions "move to next table section")

Tasks:
- [ ] Test arrow key navigation flows naturally
- [ ] Test wrapping behavior at table boundaries (up/down)
- [ ] Implement Tab key to move between tables (optional, may defer)
- [ ] Test focus management and focus ring visibility
- [ ] Verify keyboard shortcuts don't conflict with browser defaults

### Step 5: Copy/Paste Type Matching
**Objective**: Verify smart type matching works correctly

Current logic:
- Value type (numeric fields): Copy from any numeric field, paste to any numeric field
- Position type (distance, x1, x2): Copy from position fields, paste to position fields
- Cannot copy from direction field (read-only)

Determination logic:
```typescript
const type = ['distance', 'x1', 'x2'].includes(field) ? 'position' : 'value';
```

Paste compatibility check:
```typescript
const canPaste = (targetField: string, clipData: ClipboardData): boolean => {
  const numericFields = ['fx', 'fy', 'mz', 'w1', 'w2', 'x1', 'x2', 'distance', 'magnitude'];
  const positionFields = ['distance', 'x1', 'x2'];

  if (clipData.type === 'value') {
    return numericFields.includes(targetField);
  } else {
    return positionFields.includes(targetField);
  }
};
```

Tasks:
- [ ] Test copying numeric value from any field (fx, w1, distance, etc.)
- [ ] Test pasting to compatible numeric fields
- [ ] Test copying position from distance, x1, x2
- [ ] Test pasting position to x1, x2 (but not other numeric fields)
- [ ] Test paste fails silently on incompatible fields
- [ ] Test cross-load-type copy/paste (distributed↔point, etc.)

### Step 6: Value Persistence
**Objective**: Verify changes persist correctly in store

Current implementation:
- saveEdit() calls updateNodalLoad(), updateDistributedLoad(), updateElementPointLoad()
- Updates are sent directly to Zustand store
- Should persist across tab switches and component re-renders

Tasks:
- [ ] Edit a load value, save with Enter
- [ ] Switch to another tab and back to Loads
- [ ] Verify value is still changed (persisted to store)
- [ ] Verify multiple changes in sequence save correctly
- [ ] Test with both main store and cache systems

### Step 7: Cross-Component Consistency
**Objective**: Ensure Loads tab matches Nodes tab UX

Comparison checklist:
- [ ] Selection styling (blue outline) matches Nodes tab
- [ ] Editing styling (yellow background) matches Nodes tab
- [ ] Paste highlight (green) matches Nodes tab
- [ ] Font sizes are consistent
- [ ] Spacing/padding is consistent
- [ ] Border styles match
- [ ] Header styling matches
- [ ] Empty state messaging style matches

### Step 8: Complete Workflow Testing
**Objective**: Test realistic user workflows end-to-end

Test scenarios:
1. **Simple editing**
   - [ ] Click a cell, press F2, type new value, press Enter
   - [ ] Verify value updates in table and persists
   - [ ] Click another cell

2. **Copy/paste values**
   - [ ] Copy fx=10 from nodal load (Ctrl+C)
   - [ ] Navigate to another cell (fy, w1, distance, etc.)
   - [ ] Paste with Ctrl+V
   - [ ] Verify new value appears

3. **Copy/paste across tables**
   - [ ] Copy w1=5 from distributed load
   - [ ] Navigate to point load table
   - [ ] Paste to distance field
   - [ ] Verify paste succeeds (both numeric fields)

4. **Position-aware paste**
   - [ ] Copy distance=2.5 from point load
   - [ ] Navigate to distributed load x1 field
   - [ ] Paste with Ctrl+V
   - [ ] Verify paste succeeds (both position fields)
   - [ ] Try paste to w1 field - should fail silently (not a position field)

5. **Load case filtering**
   - [ ] Create loads in multiple load cases
   - [ ] Switch load case dropdown
   - [ ] Verify table shows correct loads for active case
   - [ ] Verify counts update in section headers

6. **Tab switching**
   - [ ] Make changes in Loads tab
   - [ ] Switch to Nodes tab
   - [ ] Switch back to Loads tab
   - [ ] Verify changes persisted

7. **Keyboard-only workflow**
   - [ ] Select cell with mouse click
   - [ ] Navigate entirely with arrow keys (don't use mouse)
   - [ ] Edit with F2, save with Enter, cancel with Escape
   - [ ] Copy with Ctrl+C, paste with Ctrl+V
   - [ ] Verify all operations work without mouse

## Known Limitations / Future Features

- Direction field is read-only (could be dropdown in future)
- No collapsible sections yet (spec mentions, not critical)
- No delete button/hotkey for loads (handled elsewhere)
- Tab key navigation between tables not implemented (defer)
- No add-load button in table header (handled in dialog elsewhere)

## File Structure

```
2dfea/src/components/
├── LoadsTab.tsx                  # Main container, state, keyboard handling
├── LoadTables/
│   ├── NodalLoadTable.tsx        # Nodal loads table
│   ├── DistributedLoadTable.tsx  # Distributed loads table
│   └── PointLoadTable.tsx        # Element point loads table
```

## State Management

### Local State (LoadsTab.tsx)
```typescript
const [selectedCell, setSelectedCell] = useState<{
  loadType: 'nodal' | 'distributed' | 'point';
  rowIndex: number;
  field: string;
} | null>(null);

const [editingCell, setEditingCell] = useState<{
  loadType: 'nodal' | 'distributed' | 'point';
  rowIndex: number;
  field: string;
} | null>(null);

const [editValue, setEditValue] = useState('');

const [clipboard, setClipboard] = useState<{
  value: number;
  type: 'value' | 'position';
  sourceLoadType?: 'nodal' | 'distributed' | 'point';
} | null>(null);
```

### Global Store Integration
- Reads: nodalLoads, distributedLoads, elementPointLoads from useModelStore
- Writes: updateNodalLoad(), updateDistributedLoad(), updateElementPointLoad()
- Load case filtering: Uses activeLoadCase from useModelStore

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| Arrow Up | Previous row | In table |
| Arrow Down | Next row | In table |
| Arrow Left | Previous column | In table |
| Arrow Right | Next column | In table |
| F2 | Enter edit mode | Cell selected |
| Enter | Save changes | Cell editing |
| Escape | Cancel edit | Cell editing |
| Ctrl+C | Copy value | Cell selected |
| Ctrl+V | Paste value | Cell selected |

## Testing Checklist

- [ ] All three tables render correctly with proper columns
- [ ] Empty state shows for load types with no loads
- [ ] Load counts update when loads added/removed
- [ ] Keyboard navigation works in all three tables
- [ ] Arrow keys don't scroll page (preventDefault working)
- [ ] F2 activates edit mode with focus on input
- [ ] Enter saves and closes edit mode
- [ ] Escape cancels without saving
- [ ] Ctrl+C copies value to clipboard
- [ ] Ctrl+V pastes to compatible cells
- [ ] Paste highlights show on compatible cells
- [ ] Values persist after edit and tab switch
- [ ] Visual styling matches Nodes tab
- [ ] No console errors or warnings
- [ ] Focus ring visible for accessibility

## Next Action

Proceed with Phase 7 step-by-step verification:
1. Test visual feedback (colors, styling)
2. Test all keyboard shortcuts
3. Test copy/paste with type matching
4. Test value persistence
5. Test cross-component consistency
6. Run complete workflow tests

Estimated time: 2-4 hours for testing and minor adjustments
