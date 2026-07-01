export class FileTreeViewer {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.treeData = null;
    this.selectedPath = null;
    this.onFileSelect = null;
    this.onDirectoryToggle = null;
    this.expandedDirs = new Set();
  }

  setData(files) {
    this.treeData = this._buildTree(files);
    this.render();
  }

  getTreeData() {
    return this.treeData;
  }

  setCallbacks({ onFileSelect, onDirectoryToggle }) {
    this.onFileSelect = onFileSelect;
    this.onDirectoryToggle = onDirectoryToggle;
  }

  _buildTree(files) {
    const root = { name: '', path: '', type: 'directory', children: [], expanded: true };

    for (const file of files) {
      const parts = file.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const fullPath = parts.slice(0, i + 1).join('/');

        let child = current.children.find(c => c.name === part);

        if (!child) {
          child = {
            name: part,
            path: fullPath,
            type: isFile ? 'file' : 'directory',
            children: isFile ? [] : [],
            expanded: false,
            lang: isFile ? file.lang : null,
            color: isFile ? file.color : null,
            errors: isFile ? file.errors?.length || 0 : 0,
            lines: isFile ? file.lines : 0,
            complexity: isFile ? file.complexity : 0,
          };
          current.children.push(child);
        } else if (isFile) {
          child.lang = file.lang;
          child.color = file.color;
          child.errors = file.errors?.length || 0;
          child.lines = file.lines;
          child.complexity = file.complexity;
        }

        current = child;
      }
    }

    this._sortTree(root);
    return root;
  }

  _sortTree(node) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === 'directory') this._sortTree(child);
    }
  }

  render() {
    if (!this.treeData) return;
    this.container.innerHTML = '';
    const ul = this._renderNode(this.treeData, 0, true);
    this.container.appendChild(ul);
  }

  _renderNode(node, depth, isRoot = false) {
    const ul = document.createElement('ul');
    ul.className = 'file-tree';
    if (isRoot) ul.classList.add('file-tree-root');

    for (const child of node.children) {
      const li = document.createElement('li');
      li.className = `file-tree-item ${child.type}`;
      li.dataset.path = child.path;
      if (child.lang) li.dataset.lang = child.lang;

      const row = document.createElement('div');
      row.className = 'file-tree-row';
      row.style.paddingLeft = `${depth * 16 + 8}px`;

      if (child.type === 'directory') {
        const toggle = document.createElement('span');
        toggle.className = 'file-tree-toggle';
        toggle.textContent = this.expandedDirs.has(child.path) ? '▼' : '▶';
        toggle.addEventListener('click', e => {
          e.stopPropagation();
          this._toggleDirectory(child.path);
        });
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'file-tree-toggle';
        row.appendChild(spacer);
      }

      const icon = document.createElement('span');
      icon.className = 'file-tree-icon';
      icon.textContent = child.type === 'directory' ? '📁' : this._getFileIcon(child.lang);
      row.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'file-tree-name';
      name.textContent = child.name;
      row.appendChild(name);

      const badges = document.createElement('div');
      badges.className = 'file-tree-badges';

      if (child.type === 'file') {
        if (child.errors > 0) {
          const badge = document.createElement('span');
          badge.className = 'file-tree-badge errors';
          badge.textContent = `⚠ ${child.errors}`;
          badges.appendChild(badge);
        }
        if (child.lines > 0) {
          const badge = document.createElement('span');
          badge.className = 'file-tree-badge lines';
          badge.textContent = `${child.lines} L`;
          badges.appendChild(badge);
        }
        if (child.complexity > 5) {
          const badge = document.createElement('span');
          badge.className = 'file-tree-badge complexity';
          badge.textContent = `⟳ ${child.complexity}`;
          badges.appendChild(badge);
        }
      }

      row.appendChild(badges);
      li.appendChild(row);

      if (child.type === 'directory') {
        const childUl = document.createElement('ul');
        childUl.className = 'file-tree';
        childUl.style.display = this.expandedDirs.has(child.path) ? 'block' : 'none';
        for (const grandChild of child.children) {
          childUl.appendChild(this._renderNode(grandChild, depth + 1));
        }
        li.appendChild(childUl);
      }

      row.addEventListener('click', () => this._selectItem(child, row));

      ul.appendChild(li);
    }

    return ul;
  }

  _getFileIcon(lang) {
    const icons = {
      JavaScript: '📄',
      TypeScript: '📄',
      JSX: '⚛',
      TSX: '⚛',
      Python: '🐍',
      CSS: '🎨',
      SCSS: '🎨',
      Markdown: '📝',
      JSON: '📋',
    };
    return icons[lang] || '📄';
  }

  _toggleDirectory(path) {
    if (this.expandedDirs.has(path)) {
      this.expandedDirs.delete(path);
    } else {
      this.expandedDirs.add(path);
    }
    this.render();
    if (this.onDirectoryToggle) this.onDirectoryToggle(path, this.expandedDirs.has(path));
  }

  _selectItem(node, rowElement) {
    if (node.type === 'directory') {
      this._toggleDirectory(node.path);
      return;
    }

    document
      .querySelectorAll('.file-tree-row.selected')
      .forEach(el => el.classList.remove('selected'));
    rowElement.classList.add('selected');
    this.selectedPath = node.path;

    if (this.onFileSelect) this.onFileSelect(node);
  }

  collapseAll() {
    this.expandedDirs.clear();
    this.render();
  }

  expandAll() {
    this._expandAllDirs(this.treeData);
    this.render();
  }

  _expandAllDirs(node) {
    for (const child of node.children) {
      if (child.type === 'directory') {
        this.expandedDirs.add(child.path);
        this._expandAllDirs(child);
      }
    }
  }
}
