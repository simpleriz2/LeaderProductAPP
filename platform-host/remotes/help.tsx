import React from 'react';
import { Text } from 'react-native';
declare const __LP2_PROBE_VERSION__: string;
declare const __LP2_PROBE_FAIL_STARTUP__: boolean;
// Delivery probe; existing Help/data recovery remains in the legacy application.
export default function HelpProbe() { if(__LP2_PROBE_FAIL_STARTUP__)throw Error('Deliberate local probe startup failure'); const [version]=React.useState(__LP2_PROBE_VERSION__); return <Text>Help delivery probe {version}</Text>; }
