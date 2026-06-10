export function referralCodeFromSearchParams(searchParams: URLSearchParams) {
  return searchParams.get('aff') ?? searchParams.get('ref') ?? ''
}
