'use client';
import { Printer } from 'lucide-react';
import { btn } from './ui';
export const PrintButton = () => <button onClick={() => window.print()} className={btn('outline', 'sm', 'no-print')}><Printer size={15} />Print receipt</button>;
