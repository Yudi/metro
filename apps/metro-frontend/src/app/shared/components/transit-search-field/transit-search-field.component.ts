import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-transit-search-field',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './transit-search-field.component.html',
  styleUrl: './transit-search-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransitSearchFieldComponent {
  readonly query = input('');
  readonly loading = input(false);
  readonly label = input('Estação ou ponto de ônibus');
  readonly placeholder = input('Digite o nome da estação ou ponto...');
  readonly clearable = input(false);

  readonly queryChange = output<string>();
  readonly cleared = output<void>();

  @ViewChild('searchInput')
  private readonly searchInputRef?: ElementRef<HTMLInputElement>;

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.queryChange.emit(target.value);
  }

  onClear(): void {
    this.cleared.emit();
    this.focus();
  }

  focus(): void {
    this.searchInputRef?.nativeElement.focus();
  }
}
