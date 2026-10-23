import { AppProps } from '../../../types';
import { ShoeOutfitStylistApp } from '../ShoeOutfitStylistApp';

export default function App({ platform, costs }: AppProps) {
  return <ShoeOutfitStylistApp platform={platform} costs={costs} />;
}