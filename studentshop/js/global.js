// Navigation Variables
const hamburger = document.querySelector('.menu-button');
const navOverlay = document.querySelector('.nav-overlay');
const navMiddle = document.querySelector('.navigation-middle');
const navMenu = document.querySelector('.nav-menu');

function toggleNav(isOpen) {
  // Update button style and navigation elements
  hamburger.classList.toggle('--open', isOpen);
  navMenu.classList.toggle('--open', isOpen);
  navOverlay.style.display = isOpen ? 'block' : 'none';

  // Move navMenu based on visibility
  isOpen ? navOverlay.appendChild(navMenu) : navMiddle.appendChild(navMenu);
}

// Toggle navigation on hamburger click
hamburger.addEventListener('click', () => {
  toggleNav(!navMenu.classList.contains('--open'));
});
