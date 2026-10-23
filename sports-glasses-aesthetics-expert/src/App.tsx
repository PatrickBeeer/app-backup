import { AppProps } from '../../../types';
import { SportsGlassesAestheticsExpertApp } from '../SportsGlassesAestheticsExpertApp';

export default function App({ platform, costs }: AppProps) {
  return <SportsGlassesAestheticsExpertApp platform={platform} costs={costs} />;
}