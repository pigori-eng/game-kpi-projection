export const formatNumber = (num: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

// V7: 차트 Y축용 컴팩트 포맷 (1.2M, 500K, 3.5B 등)
export const formatCompactNumber = (num: number): string => {
  if (num >= 1_000_000_000_000) {
    return `${(num / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`;
  }
  return num.toFixed(0);
};

// V7: 한글 컴팩트 포맷 (1.2조, 500억, 3.5만 등)
export const formatCompactKorean = (num: number): string => {
  if (num >= 1_000_000_000_000) {
    return `${(num / 1_000_000_000_000).toFixed(1)}조`;
  }
  if (num >= 100_000_000) {
    return `${(num / 100_000_000).toFixed(1)}억`;
  }
  if (num >= 10_000) {
    return `${(num / 10_000).toFixed(0)}만`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}천`;
  }
  return num.toFixed(0);
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
