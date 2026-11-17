import React from 'react';
import { Text } from 'react-native';
declare const __LP2_PROBE_VERSION__: string;
// Delivery probe; existing Help/data recovery remains in the legacy application.
export default function HelpProbe() { const [version]=React.useState(__LP2_PROBE_VERSION__); return <Text>Help delivery probe {version}</Text>; }
