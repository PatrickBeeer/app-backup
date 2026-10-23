import { AppProps } from '../../../types';
import { ProductSelectionCalendarApp } from '../ProductSelectionCalendarApp';

export default function App({ platform, costs }: AppProps) {
  return <ProductSelectionCalendarApp platform={platform} costs={costs} />;
}
