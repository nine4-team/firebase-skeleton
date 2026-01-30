import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { ExpandableCard } from '../../src/components/ExpandableCard';
import { Screen } from '../../src/components/Screen';
import { useScreenTabs } from '../../src/components/ScreenTabs';
import { CARD_LIST_GAP, layout } from '../../src/ui';

export default function ComponentsScreen() {
  return (
    <Screen 
      title="Components"
      tabs={[
        { key: 'cards', label: 'Cards', accessibilityLabel: 'Cards tab' },
        { key: 'tab-two', label: 'Tab Two', accessibilityLabel: 'Tab Two' },
        { key: 'tab-three', label: 'Tab Three', accessibilityLabel: 'Tab Three' },
      ]}
      initialTabKey="cards"
    >
      <ComponentsScreenContent />
    </Screen>
  );
}

function ComponentsScreenContent() {
  const screenTabs = useScreenTabs();
  const selectedKey = screenTabs?.selectedKey ?? 'cards';

  if (selectedKey === 'cards') {
    return (
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ExpandableCard
          title="Expandable Card"
          expandableRow1={{ label: 'Expandable Field 1', value: 'Expandable Field 3' }}
          expandableRow2={{ label: 'Expandable Field 2', value: 'Expandable Field 4' }}
          alwaysShowRow1={{ label: 'Always Show 1', value: 'Always Show Value 1' }}
          alwaysShowRow2={{ label: 'Always Show 2', value: 'Always Show Value 2' }}
          menuBadgeEnabled
          menuBadgeLabel="Badge"
          menuItems={[
            {
              key: 'action-with-subactions',
              label: 'Action 1',
              defaultSelectedSubactionKey: 'subaction-1',
              subactions: [
                { key: 'subaction-1', label: 'Subaction 1', onPress: () => console.log('Subaction 1 pressed') },
                { key: 'subaction-2', label: 'Subaction 2', onPress: () => console.log('Subaction 2 pressed') },
              ],
            },
            { key: 'edit', label: 'Edit', onPress: () => console.log('Edit pressed') },
            { key: 'delete', label: 'Delete', onPress: () => console.log('Delete pressed') },
          ]}
        />
      </ScrollView>
    );
  }

  if (selectedKey === 'tab-two') {
    return (
      <View style={styles.placeholder}>
        <AppText variant="body">Tab Two content goes here.</AppText>
      </View>
    );
  }

  return (
    <View style={styles.placeholder}>
      <AppText variant="body">Tab Three content goes here.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: layout.screenBodyTopMd.paddingTop,
    gap: CARD_LIST_GAP,
  },
  placeholder: {
    paddingTop: layout.screenBodyTopMd.paddingTop,
  },
});
