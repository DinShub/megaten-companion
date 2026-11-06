import { ChangeDetectionStrategy, Component } from '@angular/core';

import { GAME_AI } from '../../../../core/ai/game-ai';
import { AiChat } from '../../../../shared/ai-chat/ai-chat';
import { Smt3Ai } from '../../ai/smt3-ai';

/** Plugs Nocturne into the shared chat. */
@Component({
  selector: 'app-smt3-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiChat],
  providers: [{ provide: GAME_AI, useExisting: Smt3Ai }],
  template: `
    <div class="s3-page">
      <header class="s3-head"><h1>Chat</h1></header>
      <app-ai-chat />
    </div>
  `,
})
export class Smt3ChatPage {}
