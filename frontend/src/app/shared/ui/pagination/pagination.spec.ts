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
});
