import {HostListener, Injectable} from '@angular/core';
import { v4 as uuidv4 } from "uuid";

@Injectable({
  providedIn: 'root'
})
export class ContextMenuService {

  MenuPosition = {
    TOP: "top",
    BOTTOM: "bottom",
    TOP_LEFT: "top_left",
    TOP_RIGHT: "top_right",
    BOTTOM_LEFT: "bottom_left",
    BOTTOM_RIGHT: "delisted",
  };

  currentlyOpenContextMenu: HTMLElement | null = null;

  eventListenerCleanupFunctions: Array<() => void> = [];

  constructor() { }

  createContextMenu(parentButton: HTMLElement, contextMenuButtons: { html: string, function?: () => void }[], menuPosition?: string) {
    const uniqueIdentifier = uuidv4();
    parentButton.id = `button:${uniqueIdentifier}`;

    // Create context menu.
    const contextMenu = document.createElement("div");
    contextMenu.id = uniqueIdentifier;
    contextMenu.className = "context-menu";

    // Add context menu buttons to context menu.
    for (let i = 0; i < contextMenuButtons.length; i++) {
      contextMenu.insertAdjacentHTML("beforeend", contextMenuButtons[i].html);
      const menuButtonElement = contextMenu.children[i];

      if (contextMenuButtons[i].function) {
        // Create button function to destroy context menu before running function.
        const buttonFunction = () => {
          this.destroyContextMenu();
          contextMenuButtons[i].function!!();
        };

        // Add event listener.
        menuButtonElement.addEventListener("click", buttonFunction, { once: true });
        // Add event lister clean up function to array.
        this.eventListenerCleanupFunctions.push(() =>
          menuButtonElement.removeEventListener("click", buttonFunction));
      }
    }

    // Position context menu.
    this.#setMenuPosition(contextMenu, parentButton, menuPosition);

    // Set currently open context menu.
    parentButton.classList.toggle("active", true);
    this.currentlyOpenContextMenu = contextMenu;
  }

  destroyContextMenu() {
    // Remove event listeners.
    this.eventListenerCleanupFunctions.forEach(fn => fn());
    this.eventListenerCleanupFunctions.length = 0;

    // Remove active class from parent button.
    const parentButton = document.getElementById(`button:${this.currentlyOpenContextMenu?.id}` || "");
    parentButton?.classList.toggle("active", false);

    // Destroy context menu.
    const contextMenu = document.getElementById(this.currentlyOpenContextMenu?.id || "");
    contextMenu?.remove();
    this.currentlyOpenContextMenu = null;
  }

  #getViewportPosition(element: HTMLElement) {
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left,      // distance from viewport left
      top: rect.top,        // distance from viewport top
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }

  #setMenuPosition(contextMenu: HTMLElement, parentButton: HTMLElement, menuPosition?: string) {
    const parentButtonPosition = this.#getViewportPosition(parentButton);

    document.body.appendChild(contextMenu);
    contextMenu.style.zIndex = "2000";

    let contextMenuTop = "";
    let contextMenuLeft = "";
    const verticalSpacing = 10;
    const gap = 5;

    switch (menuPosition) {
      case (this.MenuPosition.TOP):
        contextMenuTop = `${parentButtonPosition.top - contextMenu.clientHeight - gap}px`;
        contextMenuLeft = `${parentButtonPosition.left + parentButtonPosition.width/2 - contextMenu.clientWidth/2}px`;
        break;
      case (this.MenuPosition.BOTTOM):
        contextMenuTop = `${parentButtonPosition.top + parentButtonPosition.height + gap}px`;
        contextMenuLeft = `${parentButtonPosition.left + parentButtonPosition.width/2 - contextMenu.clientWidth/2}px`;
        break;
      case (this.MenuPosition.TOP_LEFT):
        contextMenuTop = `${parentButtonPosition.top - contextMenu.clientHeight - gap}px`;
        contextMenuLeft = `${parentButtonPosition.left + parentButtonPosition.width - contextMenu.clientWidth + verticalSpacing}px`;
        break;
      case (this.MenuPosition.TOP_RIGHT):
        contextMenuTop = `${parentButtonPosition.top - contextMenu.clientHeight - gap}px`;
        contextMenuLeft = `${parentButtonPosition.left - verticalSpacing}px`;
        break;
      case (this.MenuPosition.BOTTOM_LEFT):
        contextMenuTop = `${parentButtonPosition.top + parentButtonPosition.height + gap}px`;
        contextMenuLeft = `${parentButtonPosition.left + parentButtonPosition.width - contextMenu.clientWidth + verticalSpacing}px`;
        break;
      case (this.MenuPosition.BOTTOM_RIGHT):
        contextMenuTop = `${parentButtonPosition.top + parentButtonPosition.height + gap}px`;
        contextMenuLeft = `${parentButtonPosition.left - verticalSpacing}px`;
        break;
      default:
        // Auto set position.

        // BOTTOM_RIGHT
        let contextMenuTopTemp = parentButtonPosition.top + parentButtonPosition.height + gap;
        let contextMenuLeftTemp = parentButtonPosition.left - verticalSpacing;

        if (contextMenuTopTemp + contextMenu.clientHeight >= window.innerHeight - gap) {
          // TOP
          contextMenuTopTemp = parentButtonPosition.top - contextMenu.clientHeight - gap;
        }
        if (contextMenuLeftTemp + contextMenu.clientWidth >= window.innerWidth - gap) {
          // LEFT
          contextMenuLeftTemp = parentButtonPosition.left + parentButtonPosition.width - contextMenu.clientWidth + verticalSpacing;
        }

        contextMenuTop = `${contextMenuTopTemp}px`;
        contextMenuLeft = `${contextMenuLeftTemp}px`;
        break;
    }

    contextMenu.style.top = contextMenuTop;
    contextMenu.style.left = contextMenuLeft;
  }

  closeContextMenuOnClicks(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    // Close contextMenu if clicked outside contextMenu and not on parentButton.
    const clickedOutsideContextMenu: boolean = !this.currentlyOpenContextMenu?.contains(target);
    if (this.currentlyOpenContextMenu && clickedOutsideContextMenu) {
      const parentButton = document.getElementById("button:" + this.currentlyOpenContextMenu.id);
      if (parentButton && !parentButton.contains(target)) {
        this.destroyContextMenu();
      }
    }
  }
}
