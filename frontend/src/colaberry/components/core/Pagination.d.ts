/** Page navigation with prev/next and number pills. */
export interface PaginationProps { page: number; total: number; siblings?: number; onChange?: (page: number) => void; }
export function Pagination(props: PaginationProps): JSX.Element;
