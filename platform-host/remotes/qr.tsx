import React from 'react';
import { Text } from 'react-native';
declare const __LP2_PROBE_VERSION__: string;
// Delivery probe; existing QR workflows are not replaced by this fixture.
export default function QrProbe() { const [version]=React.useState(__LP2_PROBE_VERSION__); return <Text>QR delivery probe {version}</Text>; }
