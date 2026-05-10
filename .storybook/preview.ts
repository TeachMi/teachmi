import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'
import { DirectionProvider } from '@radix-ui/react-direction'
import '../src/app/globals.css'
import './preview.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
  globalTypes: {
    direction: {
      name: 'Direction',
      description: 'Text direction (TeachMe is Hebrew-first; primitives must render correctly in both)',
      defaultValue: 'rtl',
      toolbar: {
        icon: 'transfer',
        items: [
          { value: 'rtl', title: 'RTL · עברית', right: 'rtl' },
          { value: 'ltr', title: 'LTR · English', right: 'ltr' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const direction = context.globals.direction ?? 'rtl'
      const lang = direction === 'rtl' ? 'he' : 'en'
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('dir', direction)
        document.documentElement.setAttribute('lang', lang)
      }
      return React.createElement(
        DirectionProvider,
        { dir: direction },
        React.createElement(
          'div',
          { dir: direction, lang, className: 'min-h-[6rem] bg-surface p-6 text-on-surface font-body' },
          React.createElement(Story, null)
        )
      )
    },
  ],
};

export default preview;