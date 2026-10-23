import { AppProps } from '../../../types';
import { Seedance20ScriptMasterApp } from '../App';

export default function App({ platform, costs }: AppProps) {
  return <Seedance20ScriptMasterApp platform={platform} costs={costs} />;
}