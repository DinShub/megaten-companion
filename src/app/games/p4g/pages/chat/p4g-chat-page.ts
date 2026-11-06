import { ChangeDetectionStrategy, Component } from '@angular/core';

import { GAME_AI } from '../../../../core/ai/game-ai';
import { AiChat } from '../../../../shared/ai-chat/ai-chat';
import { P4gAi } from '../../ai/p4g-ai';

/** Plugs P4G into the shared chat. */
@Component({
  selector: 'app-p4g-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiChat],
  providers: [{ provide: GAME_AI, useExisting: P4gAi }],
  template: `
    <div class="p4-page">
      <header class="p4-head"><h1>Chat</h1></header>
      <app-ai-chat />
    </div>
  `,
})
export class P4gChatPage {}
