import { View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { layout } from '../../src/ui';

export default function ScreenTwo() {
  return (
    <Screen title="Screen Two">
      <View style={layout.screenBodyTopMd}>
        <AppText variant="body">This is Screen Two.</AppText>
      </View>
    </Screen>
  );
}
