import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

describe('Pagination', () => {
  let fixture: ComponentFixture<Pagination>;
  let root: HTMLElement;

  const button = (label: string) => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  async function render(currentPage: number, totalPages: number): Promise<void> {
    fixture.componentRef.setInput('currentPage', currentPage);
    fixture.componentRef.setInput('totalPages', totalPages);
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(Pagination);
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders nothing when everything fits on one page', async () => {
    await render(1, 1);

    expect(root.querySelector('nav')).toBeNull();
  });

  it('shows where you are and disables Previous on the first page', async () => {
    await render(1, 3);

    expect(root.textContent).toContain('Page 1 of 3');
    expect(button('Previous page').disabled).toBe(true);
    expect(button('Next page').disabled).toBe(false);
  });

  it('disables Next on the last page', async () => {
    await render(3, 3);

    expect(button('Next page').disabled).toBe(true);
    expect(button('Previous page').disabled).toBe(false);
  });

  it('moves the page and announces the change', async () => {
    await render(2, 3);
    const changes: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => changes.push(page));

    button('Next page').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.currentPage()).toBe(3);

    button('Previous page').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.currentPage()).toBe(2);
    expect(changes).toEqual([3, 2]);
  });

  it('ignores a page outside the range', async () => {
    await render(1, 3);
    const changes: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => changes.push(page));

    (fixture.componentInstance as unknown as { changePage(p: number): void }).changePage(0);
    (fixture.componentInstance as unknown as { changePage(p: number): void }).changePage(4);

    expect(fixture.componentInstance.currentPage()).toBe(1);
    expect(changes).toEqual([]);
  });

  describe('rows per page', () => {
    const SIZES = [5, 10, 25];

    async function renderWithSizes(currentPage: number, totalPages: number, totalItems: number, pageSize = 5): Promise<void> {
      fixture.componentRef.setInput('pageSizeOptions', SIZES);
      fixture.componentRef.setInput('totalItems', totalItems);
      fixture.componentRef.setInput('pageSize', pageSize);
      await render(currentPage, totalPages);
    }

    const select = () => root.querySelector<HTMLSelectElement>('[data-testid="pagination-page-size"] select')!;
    const range = () => root.querySelector('[data-testid="pagination-range"]')?.textContent?.replace(/\s+/g, ' ').trim();

    it('is hidden unless page sizes are given', async () => {
      await render(1, 3);

      expect(root.querySelector('[data-testid="pagination-page-size"]')).toBeNull();
    });

    it('offers the sizes in the shared dropdown, labelled, with the current one selected', async () => {
      await renderWithSizes(1, 5, 23);

      const options = Array.from(select().options).map((option) => option.textContent?.trim());
      expect(options).toEqual(['5', '10', '25']);
      expect(select().value).toBe('5');
      expect(root.querySelector('app-dropdown select.is-compact')).toBeTruthy();
      expect(root.querySelector('label')?.getAttribute('for')).toBe(select().id);
      expect(root.querySelector('label')?.textContent).toContain('Rows per page');
    });

    it('shows the range and keeps the selector even when everything fits on one page', async () => {
      await renderWithSizes(1, 1, 3, 5);

      expect(range()).toBe('1-3 of 3');
      expect(root.querySelector('nav')).toBeNull();
      expect(select()).toBeTruthy();
    });

    it('updates the range as the page moves', async () => {
      await renderWithSizes(2, 5, 23);

      expect(range()).toBe('6-10 of 23');
    });

    it('says 0-0 of 0 for an empty list', async () => {
      await renderWithSizes(1, 1, 0);

      expect(range()).toBe('0-0 of 0');
    });

    it('applies a new size and goes back to the first page', async () => {
      await renderWithSizes(3, 5, 23);

      select().value = '10';
      select().dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(fixture.componentInstance.pageSize()).toBe(10);
      expect(fixture.componentInstance.currentPage()).toBe(1);
    });

    it('ignores a size that was not offered', async () => {
      await renderWithSizes(3, 5, 23);
      select().innerHTML += '<option value="99">99</option>';

      select().value = '99';
      select().dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(fixture.componentInstance.pageSize()).toBe(5);
      expect(fixture.componentInstance.currentPage()).toBe(3);
    });
  });
});
