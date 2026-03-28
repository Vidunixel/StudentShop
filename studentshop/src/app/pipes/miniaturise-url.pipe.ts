import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'miniaturiseUrl',
  standalone: true
})
export class MiniaturiseUrlPipe implements PipeTransform {

  transform(url: string): string {
    const regex = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/;
    const match = url.match(regex);
    return match ? match[1] : url; // Return the domain name or original url if no match
  }
}
