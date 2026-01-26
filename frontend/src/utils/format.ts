export const formatNumber = (num: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

export const formatCurrency = (num: number): string => {
  if (num >= 1_000_000_000_000) {
    return `${(num / 1_000_000_000_000).toFixed(2)}조`;
  }
  if (num >= 100_000_000) {
    return `${(num / 100_000_000).toFixed(2)}억`;
  }
  if (num >= 10_000) {
    return `${(num / 10_000).toFixed(0)}만`;
  }
  return formatNumber(num);
};

export const formatPercent = (num: number, decimals: number = 1): string => {
  return `${(num * 100).toFixed(decimals)}%`;
};

export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
