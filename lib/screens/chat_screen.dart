import 'package:flutter/material.dart';
import '../theme/brand_colors.dart';
import '../widgets/brand_app_bar_title.dart';

/// Pestaña "Chat": placeholder — se desarrollará en una siguiente etapa.
class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const BrandAppBarTitle(subtitulo: 'Chat')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: BrandColors.cian.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(Icons.chat_bubble_outline, size: 40, color: BrandColors.cian),
              ),
              const SizedBox(height: 20),
              const Text(
                'Próximamente',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: BrandColors.azulMarino),
              ),
              const SizedBox(height: 8),
              Text(
                'El chat se estará desarrollando en una próxima actualización.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
