import { ChangeDetectionStrategy, Component } from '@angular/core';

import { GAME_AI } from '../../../../core/ai/game-ai';
import { AiChat } from '../../../../shared/ai-chat/ai-chat';
import { P5rAi } from '../../ai/p5r-ai';
import { RansomTitle } from '../../ui/ransom-title';

/** Plugs P5R into the shared chat and titles it in the Calling Card style. */
@Component({
  selector: 'app-p5r-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiChat, RansomTitle],
  providers: [{ provide: GAME_AI, useExisting: P5rAi }],
  template: `
    <app-ransom-title text="Chat" />
    <app-ai-chat />
  `,
})
export class P5rChatPage {}
