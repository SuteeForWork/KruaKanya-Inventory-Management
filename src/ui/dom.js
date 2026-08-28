/**
 * Minimal DOM builder.
 *
 * `el('div', { class: 'card' }, child, child)` — props map to attributes,
 * `on*` keys become listeners, and children may be nodes, strings, numbers,
 * arrays, or null/false (which are skipped). Text is set via textContent, so
 * nothing here can inject markup.
 */

export function el(tag, props = null, ...children) {
  const node = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'class') {
        node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else if (key === 'text') {
        node.textContent = String(value);
      } else if (key === 'value') {
        node.value = value;
      } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
        node[key] = Boolean(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) { append(node, child); continue; }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Render `build()` only when `condition` holds. */
export function when(condition, build) {
  return condition ? build() : null;
}

/** Replace everything inside `node` with `children`. */
export function render(node, ...children) {
  node.textContent = '';
  append(node, children);
  return node;
}
