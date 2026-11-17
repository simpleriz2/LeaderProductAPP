import React from 'react';
import { Text } from 'react-native';
declare const __LP2_PROBE_VERSION__: string;
declare const __LP2_PROBE_FAIL_STARTUP__: boolean;
// Delivery probe; existing QR workflows are not replaced by this fixture.
export default function QrProbe() { if(__LP2_PROBE_FAIL_STARTUP__)throw Error('Deliberate local probe startup failure'); const [version]=React.useState(__LP2_PROBE_VERSION__); return <Text>QR delivery probe {version}</Text>; }
