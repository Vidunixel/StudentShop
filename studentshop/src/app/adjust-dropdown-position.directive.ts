import {AfterViewChecked, Directive, ElementRef} from '@angular/core';

@Directive({
  selector: '[appAdjustDropdownPosition]',
  standalone: true
})
export class AdjustDropdownPositionDirective implements AfterViewChecked {

  constructor(private el: ElementRef) { }

  ngAfterViewChecked() {
    const dropdownButton = this.el.nativeElement;
    const dropdownWrap = this.el.nativeElement.querySelector(".overlay-dropdown-wrap");
    const dropdown = this.el.nativeElement.querySelector(".custom-dropdown");
    if (dropdownWrap && dropdown) {
      this.adjustPosition(dropdownButton, dropdownWrap, dropdown);
    }
  }

  private adjustPosition(dropdownButton: HTMLElement, dropdownWrap: HTMLElement, dropdown: HTMLElement) {
    const dropdownButtonRect: DOMRect = dropdownButton.getBoundingClientRect();
    const dropdownWrapRect: DOMRect = dropdownWrap.getBoundingClientRect();
    const dropdownRect: DOMRect = dropdown.getBoundingClientRect();
    const clientWidth: number = window.innerWidth > document.body.clientWidth ? document.body.clientWidth :
      window.innerWidth; // Visible viewport less scrollbar, else visible viewport including scrollbar.
    const viewportHeight: number = window.innerHeight;

    const gap: number = 10; // Extra spacing.

    // Check right boundary.
    if (dropdownButtonRect.right +
      dropdownWrapRect.width/2 - dropdownButtonRect.width/2 + gap > clientWidth) {
      dropdownWrap.style.right = `${- (clientWidth - dropdownButtonRect.right) + gap}px`;
    } else if (dropdownWrap.style.right && dropdownButtonRect.right +
      dropdownWrapRect.width/2 - dropdownButtonRect.width/2 + gap <= clientWidth) {
      dropdownWrap.style.right = "";
    }

    const buffer: number = 2; // Buffer to hide scrollbar.

    // Set maxWidth as scrollHeight + buffer.
    if (!dropdown.style.maxHeight) {
      dropdown.style.maxHeight = `${dropdown.scrollHeight + buffer}px`;
    }

    // Add width and height restrictions.
    dropdown.style.maxWidth = `${clientWidth - gap * 2}px`;
    dropdown.style.height = `${viewportHeight - dropdownRect.top - gap * 2}px`;
  }
}
