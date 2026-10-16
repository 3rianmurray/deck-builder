import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { setTourTarget, useTourStep } from '../lib/tour';
import type { TourTarget } from '../lib/tour';

/** How often a control the tour points at is measured again, in case it moved (scrolled, slid in). */
const REMEASURE_MS = 250;

/**
 * Wraps a control the walkthrough can point at, and reports where it is on screen while a step points at it.
 * Otherwise it's just a view.
 */
export function TourSpot({ id, style, children }: { id: TourTarget; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useRef<View>(null);
  const tour = useTourStep();
  const wanted = tour?.step.target === id;

  useEffect(() => {
    if (!wanted) return;
    const measure = () =>
      ref.current?.measureInWindow((x, y, w, h) => setTourTarget(id, w || h ? { x, y, w, h } : null));
    measure();
    const timer = setInterval(measure, REMEASURE_MS);
    return () => {
      clearInterval(timer);
      setTourTarget(id, null);
    };
  }, [wanted, id]);

  return (
    <View ref={ref} style={style} collapsable={false}>
      {children}
    </View>
  );
}
