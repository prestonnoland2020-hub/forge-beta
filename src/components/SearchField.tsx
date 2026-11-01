import { forwardRef, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

/* ONE SEARCH FIELD. Every list in Forge that can be searched uses this: a
   filled, rounded field with a magnifier inside it and a clear button once
   there is something to clear, the way iOS draws one. It has no outline at
   rest; focus is the signal ring. Styles: .search-field in brand.css. */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField({ value, onChange, className, ...rest }, ref) {
  return <span className={className ? `search-field ${className}` : 'search-field'}>
    <Icon name="search" size={16} />
    <input ref={ref} type="search" value={value} onChange={event => onChange(event.target.value)}
      autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" {...rest} />
    {value && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onChange('')}>
      <Icon name="close" size={12} stroke={2.6} />
    </button>}
  </span>;
});
