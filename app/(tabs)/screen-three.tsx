import { View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { layout } from '../../src/ui';

export default function ScreenThree() {
  return (
    <Screen title="Screen Three">
      <View style={layout.screenBodyTopMd}>
        <AppText variant="body">This is Screen Three.</AppText>
      </View>
    </Screen>
  );
}
