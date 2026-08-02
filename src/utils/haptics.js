import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const triggerHaptic = async (type = 'light') => {
  try {
    if (type === 'light') {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (type === 'medium') {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (type === 'heavy' || type === 'success') {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } else if (type === 'warning' || type === 'error') {
      await Haptics.notification({ type: NotificationType.Warning });
    }
  } catch (e) {
    // Haptics not available (web browser preview or unsupported device)
  }
};
