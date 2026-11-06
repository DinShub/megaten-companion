import { ChangeDetectionStrategy, Component } from '@angular/core';

import { GAME_AI } from '../../../../core/ai/game-ai';
import { AiChat } from '../../../../shared/ai-chat/ai-chat';
import { Smt1Ai } from '../../ai/smt1-ai';

/** Plugs SMT1 into the shared chat, under the Guidebook's running head. */
@Component({
  selector: 'app-smt1-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiChat],
  providers: [{ provide: GAME_AI, useExisting: Smt1Ai }],
  template: `
    <div class="g1-page">
      <div class="g1-runhead">
        <div>
          <h1><span class="g1-runhead__jp g1-plate" lang="ja">相談</span>Chat</h1>
        </div>
      </div>
      <app-ai-chat />
    </div>
  `,
})
export class Smt1ChatPage {}
