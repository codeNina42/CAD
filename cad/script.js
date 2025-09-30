// Mini CAD with SVG
(() => {
  const svg = document.getElementById('svgCanvas');
  const panLayer = document.getElementById('panLayer');
  const shapesGroup = document.getElementById('shapes');
  const bg = document.getElementById('bg');

  // UI
  const toolButtons = document.querySelectorAll('.toolbar button[data-tool]');
  const strokeColorInput = document.getElementById('strokeColor');
  const strokeWidthInput = document.getElementById('strokeWidth');
  const snapGridCheckbox = document.getElementById('snapGrid');
  const exportBtn = document.getElementById('exportBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  let tool = 'select';
  let isDrawing = false;
  let startPt = null;
  let currentElem = null;
  let selectedElem = null;

  // pan/zoom state
  let viewX = 0, viewY = 0, scale = 1;
  const width = svg.clientWidth, height = svg.clientHeight;

  // history (simple)
  let history = [], historyIndex = -1;
  function pushHistory() {
    // snapshot innerHTML of shapesGroup (lightweight)
    const snapshot = shapesGroup.innerHTML;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    historyIndex++;
    updateUndoRedo();
  }
  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      shapesGroup.innerHTML = history[historyIndex];
      clearSelection();
      updateUndoRedo();
    }
  }
  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      shapesGroup.innerHTML = history[historyIndex];
      clearSelection();
      updateUndoRedo();
    }
  }
  function updateUndoRedo() {
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
  }

  // helpers: screen -> world coordinates (consider pan + zoom)
  function screenToWorld(evt) {
    const rect = svg.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / scale - viewX;
    const y = (evt.clientY - rect.top) / scale - viewY;
    return snapToGrid({ x, y });
  }
  function snapToGrid(pt) {
    if (!snapGridCheckbox.checked) return pt;
    const g = 20; // grid size
    return {
      x: Math.round(pt.x / g) * g,
      y: Math.round(pt.y / g) * g
    };
  }

  // tool selection
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tool = btn.dataset.tool;
      svg.style.cursor = tool === 'select' ? 'default' : 'crosshair';
      clearSelection();
    });
  });

  // create element helpers
  function createLine(x1,y1,x2,y2) {
    const el = document.createElementNS('http://www.w3.org/2000/svg','line');
    el.setAttribute('x1', x1);
    el.setAttribute('y1', y1);
    el.setAttribute('x2', x2);
    el.setAttribute('y2', y2);
    styleShape(el);
    return el;
  }
  function createRect(x,y,w,h) {
    const el = document.createElementNS('http://www.w3.org/2000/svg','rect');
    el.setAttribute('x', Math.min(x, x+w));
    el.setAttribute('y', Math.min(y, y+h));
    el.setAttribute('width', Math.abs(w));
    el.setAttribute('height', Math.abs(h));
    styleShape(el);
    return el;
  }
  function createCircle(cx,cy,r) {
    const el = document.createElementNS('http://www.w3.org/2000/svg','circle');
    el.setAttribute('cx', cx);
    el.setAttribute('cy', cy);
    el.setAttribute('r', Math.abs(r));
    styleShape(el);
    return el;
  }
  function styleShape(el) {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', strokeColorInput.value);
    el.setAttribute('stroke-width', strokeWidthInput.value);
    el.classList.add('shape');
    // pointer events for selection
    el.style.cursor = 'pointer';
    el.addEventListener('mousedown', shapeMouseDown);
    el.addEventListener('click', shapeClick);
  }

  // mouse events on svg
  svg.addEventListener('mousedown', onMouseDown);
  svg.addEventListener('mousemove', onMouseMove);
  svg.addEventListener('mouseup', onMouseUp);
  svg.addEventListener('wheel', onWheel, { passive:false });

  // pan with right mouse button
  let panning = false, panStart = null;
  function onMouseDown(evt) {
    if (evt.button === 2) { // right button: pan
      panning = true;
      panStart = { x: evt.clientX, y: evt.clientY, viewX, viewY };
      svg.style.cursor = 'grab';
      evt.preventDefault();
      return;
    }
    const pt = screenToWorld(evt);
    if (tool === 'select') {
      // click on empty area clears selection
      // selection handled in shape events
    } else {
      isDrawing = true;
      startPt = pt;
      if (tool === 'line') {
        currentElem = createLine(pt.x, pt.y, pt.x, pt.y);
      } else if (tool === 'rect') {
        currentElem = createRect(pt.x, pt.y, 0, 0);
      } else if (tool === 'circle') {
        currentElem = createCircle(pt.x, pt.y, 0);
      }
      shapesGroup.appendChild(currentElem);
    }
  }
  function onMouseMove(evt) {
    if (panning && panStart) {
      const dx = (evt.clientX - panStart.x) / scale;
      const dy = (evt.clientY - panStart.y) / scale;
      viewX = panStart.viewX + dx;
      viewY = panStart.viewY + dy;
      updateTransform();
      return;
    }
    if (!isDrawing || !currentElem) return;
    const p = screenToWorld(evt);
    if (currentElem.tagName === 'line') {
      currentElem.setAttribute('x2', p.x);
      currentElem.setAttribute('y2', p.y);
    } else if (currentElem.tagName === 'rect') {
      const x = startPt.x, y = startPt.y;
      currentElem.setAttribute('x', Math.min(x, p.x));
      currentElem.setAttribute('y', Math.min(y, p.y));
      currentElem.setAttribute('width', Math.abs(p.x - x));
      currentElem.setAttribute('height', Math.abs(p.y - y));
    } else if (currentElem.tagName === 'circle') {
      const dx = p.x - startPt.x;
      const dy = p.y - startPt.y;
      const r = Math.sqrt(dx*dx + dy*dy);
      currentElem.setAttribute('r', r);
    }
  }
  function onMouseUp(evt) {
    if (evt.button === 2) {
      panning = false; panStart = null; svg.style.cursor = '';
      return;
    }
    if (isDrawing && currentElem) {
      // finalize
      pushHistory();
      currentElem = null;
      isDrawing = false;
    }
  }

  // wheel zoom with cursor focal
  function onWheel(evt) {
    evt.preventDefault();
    const delta = -evt.deltaY;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    // zoom toward mouse pos
    const rect = svg.getBoundingClientRect();
    const mx = (evt.clientX - rect.left) / scale - viewX;
    const my = (evt.clientY - rect.top) / scale - viewY;
    scale *= zoomFactor;
    // clamp
    scale = Math.max(0.2, Math.min(5, scale));
    // adjust view to keep focal
    viewX = (evt.clientX - rect.left) / scale - mx;
    viewY = (evt.clientY - rect.top) / scale - my;
    updateTransform();
  }

  function updateTransform() {
    panLayer.setAttribute('transform', `translate(${viewX},${viewY}) scale(${scale})`);
  }

  // selection logic
  function clearSelection() {
    if (selectedElem) {
      selectedElem.classList.remove('selected');
      removeControlOutline();
      selectedElem = null;
    }
  }
  function shapeClick(evt) {
    evt.stopPropagation();
    if (tool !== 'select') return;
    if (selectedElem) selectedElem.classList.remove('selected');
    selectedElem = evt.currentTarget;
    selectedElem.classList.add('selected');
    showControlOutline(selectedElem);
  }
  function showControlOutline(el) {
    removeControlOutline();
    const bbox = el.getBBox();
    const outline = document.createElementNS('http://www.w3.org/2000/svg','rect');
    outline.setAttribute('x', bbox.x - 6);
    outline.setAttribute('y', bbox.y - 6);
    outline.setAttribute('width', bbox.width + 12);
    outline.setAttribute('height', bbox.height + 12);
    outline.setAttribute('stroke', '#111');
    outline.setAttribute('stroke-width', 1);
    outline.setAttribute('fill', 'none');
    outline.classList.add('shape-selected');
    outline.id = 'selOutline';
    document.getElementById('controls').appendChild(outline);
  }
  function removeControlOutline() {
    const o = document.getElementById('selOutline');
    if (o) o.remove();
  }

  // move selected by dragging
  let moving = false, moveStart = null;
  function shapeMouseDown(evt) {
    if (tool !== 'select') return;
    evt.stopPropagation();
    moving = true;
    moveStart = screenToWorld(evt);
    const el = evt.currentTarget;
    // store original position attributes
    el._orig = {
      x1: el.getAttribute('x1'),
      y1: el.getAttribute('y1'),
      x2: el.getAttribute('x2'),
      y2: el.getAttribute('y2'),
      x: el.getAttribute('x'),
      y: el.getAttribute('y'),
      cx: el.getAttribute('cx'),
      cy: el.getAttribute('cy')
    };
    window.addEventListener('mousemove', onMoveDrag);
    window.addEventListener('mouseup', onMoveUp);
  }
  function onMoveDrag(evt) {
    if (!moving || !selectedElem) return;
    const p = screenToWorld(evt);
    const dx = p.x - moveStart.x;
    const dy = p.y - moveStart.y;
    const el = selectedElem;
    if (el.tagName === 'line') {
      el.setAttribute('x1', parseFloat(el._orig.x1) + dx);
      el.setAttribute('y1', parseFloat(el._orig.y1) + dy);
      el.setAttribute('x2', parseFloat(el._orig.x2) + dx);
      el.setAttribute('y2', parseFloat(el._orig.y2) + dy);
    } else if (el.tagName === 'rect') {
      el.setAttribute('x', parseFloat(el._orig.x) + dx);
      el.setAttribute('y', parseFloat(el._orig.y) + dy);
    } else if (el.tagName === 'circle') {
      el.setAttribute('cx', parseFloat(el._orig.cx) + dx);
      el.setAttribute('cy', parseFloat(el._orig.cy) + dy);
    }
    showControlOutline(el);
  }
  function onMoveUp(evt) {
    if (moving) {
      moving = false;
      moveStart = null;
      pushHistory();
      window.removeEventListener('mousemove', onMoveDrag);
      window.removeEventListener('mouseup', onMoveUp);
    }
  }

  // delete selected shape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElem) {
        selectedElem.remove();
        removeControlOutline();
        selectedElem = null;
        pushHistory();
      }
    }
    // keyboard shortcuts: L,R,C,S for tools
    if (e.key.toLowerCase() === 'l') setTool('line');
    if (e.key.toLowerCase() === 'r') setTool('rect');
    if (e.key.toLowerCase() === 'c') setTool('circle');
    if (e.key.toLowerCase() === 's') setTool('select');
  });

  function setTool(t) {
    tool = t;
    toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool===t));
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    clearSelection();
  }

  // click background clears selection
  svg.addEventListener('click', (e) => {
    if (e.target === bg) clearSelection();
  });

  // export
  exportBtn.addEventListener('click', () => {
    // produce outer svg with shapes only (no controls)
    const clone = svg.cloneNode(true);
    // remove controls/outlines
    clone.querySelectorAll('#controls, pattern').forEach(n => n.remove());
    // update size and viewBox ideally
    clone.removeAttribute('style');
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(clone);
    const blob = new Blob([str], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.svg';
    a.click();
    URL.revokeObjectURL(url);
  });

  // undo/redo
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // init: push empty state
  pushHistory();
  updateTransform();
  // keep svg focus for keyboard
  svg.addEventListener('blur', () => svg.focus());
  svg.focus();

  // disable context menu on svg for panning
  svg.addEventListener('contextmenu', e => e.preventDefault());
})();
