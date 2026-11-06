import { ChangeDetectionStrategy, Component } from '@angular/core';

import { GAME_AI } from '../../../../core/ai/game-ai';
import { AiChat } from '../../../../shared/ai-chat/ai-chat';
import { P3rAi } from '../../ai/p3r-ai';

/** Plugs P3R into the shared chat. */
@Component({
  selector: 'app-p3r-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiChat],
  providers: [{ provide: GAME_AI, useExisting: P3rAi }],
  template: `
    <div class="p3-page">
      <header class="p3-head"><h1>Chat</h1></header>
      <app-ai-chat />
    </div>
  `,
})
export class P3rChatPage {}
