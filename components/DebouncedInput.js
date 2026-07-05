import React, { useState, useEffect, useMemo } from 'react';

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 300,
  ...props
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const debouncedCallback = useMemo(
    () => {
      const handler = setTimeout(() => {
        onChange(value);
      }, debounce);

      return () => clearTimeout(handler);
    },
    [value, onChange, debounce]
  );

  useEffect(() => {
    return debouncedCallback;
  }, [debouncedCallback]);

  return (
    <input
      {...props}
      value={value ?? ''}
      onChange={e => setValue(e.target.value)}
    />
  );
} 