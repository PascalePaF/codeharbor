import helpCircle from '../assets/help-circle.png';

export function HelpHint({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  return (
    <span className={`help-hint align-${align}`} tabIndex={0} aria-label={text}>
      <img src={helpCircle} alt="帮助" />
      <span className="help-tooltip" role="tooltip">{text}</span>
    </span>
  );
}
