import InlineDemoPlayer from './InlineDemoPlayer';

interface IndustryDemoGridProps {
  trackContext: string;
}

export default function IndustryDemoGrid({ trackContext }: IndustryDemoGridProps) {
  return <InlineDemoPlayer trackContext={trackContext} />;
}
