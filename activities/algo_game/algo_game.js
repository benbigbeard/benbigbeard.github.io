const squares = document.querySelectorAll('.square');
const columns = document.querySelectorAll('.table-column');
const resetButton = document.getElementById('clear-button');
const submitButton = document.getElementById('submit-button');

// Drag and Drop Events
squares.forEach(square => {
  square.addEventListener('dragstart', (e) => {
    if (square.classList.contains('locked')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', e.target.id);
    e.target.classList.add('dragging');
  });

  square.addEventListener('dragend', (e) => {
    e.target.classList.remove('dragging');
  });
});

columns.forEach(column => {
  column.addEventListener('dragover', (e) => {
    e.preventDefault();
    column.classList.add('drag-over');
  });

  column.addEventListener('dragleave', () => {
    column.classList.remove('drag-over');
  });

  column.addEventListener('drop', (e) => {
    e.preventDefault();
    column.classList.remove('drag-over');

    const id = e.dataTransfer.getData('text/plain');
    const draggedElement = document.getElementById(id);

    if (draggedElement && !draggedElement.classList.contains('locked')) {
      column.appendChild(draggedElement);
      draggedElement.classList.add('locked');
      draggedElement.setAttribute('draggable', 'false');
    }
  });
});

// Reset Functionality
resetButton.addEventListener('click', () => {
  const leftPanel = document.getElementById('left-panel');
  squares.forEach(square => {
    leftPanel.appendChild(square);
    square.classList.remove('locked');
    square.setAttribute('draggable', 'true');
  });
});

// Submit Button Logic
submitButton.addEventListener('click', () => {
  let correct = 0; // Tracks the number of correct placements

  columns.forEach(column => {
    const answerType = column.dataset.type; // The type of answer this column expects
    const child = column.querySelector(`[data-answer="${answerType}"]`); // Check for a tile with the correct answer

    // If a matching tile is found in the column, increment the correct counter
    if (child) correct++;
  });

  // Display the result in an alert
  alert(`You got ${correct} out of ${squares.length} correct!`);
});

// Flipping Functionality
function flipTile(tile) {
  if (!tile.classList.contains('locked')) {
    tile.classList.toggle('flipped');
  }
}
